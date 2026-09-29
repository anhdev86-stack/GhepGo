import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Logger, OnModuleInit } from '@nestjs/common';
import { TokenService, type AccessPayload } from './token.service.js';
import { RedisService } from '../redis/redis.service.js';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from './otp/otp.service.js';
import { normalizeVnPhone, toLocalVnPhone } from '../common/phone.util.js';
import type { ResetPasswordDto } from './otp/otp.dto.js';

const MAX_LOGIN_FAILURES = 5;
const LOCKOUT_SECS = 15 * 60;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private prisma: PrismaService,
    private tokens: TokenService,
    private otp: OtpService,
    private redis: RedisService,
    private config: ConfigService,
  ) {}

  /** Creates the first admin from ADMIN_PHONE / ADMIN_PASSWORD when no admin exists yet. */
  async onModuleInit() {
    const phone = this.config.get<string>('ADMIN_PHONE');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!phone || !password) return;
    const admins = await this.prisma.user.count({ where: { role: 'ADMIN' } });
    if (admins > 0) return;
    const canonical = this.canonicalPhone(phone);
    const passwordHash = await bcrypt.hash(password, 10);
    await this.prisma.user.upsert({
      where: { phone: canonical },
      create: { phone: canonical, passwordHash, fullName: this.config.get<string>('ADMIN_NAME') ?? 'Admin', role: 'ADMIN', wallet: { create: { balance: 0 } } },
      update: { role: 'ADMIN', passwordHash },
    });
    this.logger.log(`Bootstrapped admin account ${canonical}`);
  }

  /** Phones are stored in local form (0xxxxxxxxx); accept any VN format on input. */
  private canonicalPhone(raw: string) {
    const e164 = normalizeVnPhone(raw);
    if (!e164) throw new BadRequestException('Số điện thoại không hợp lệ');
    return toLocalVnPhone(e164);
  }

  async register(dto: RegisterDto) {
    const phone = this.canonicalPhone(dto.phone);
    if (this.otp.required) this.otp.assertVerified(dto.verificationToken, phone, 'REGISTER');

    const existing = await this.prisma.user.findUnique({ where: { phone } });
    if (existing) {
      throw new ConflictException('Số điện thoại đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        phone,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        wallet: { create: { balance: 0 } },
        ...(dto.role === 'DRIVER'
          ? {
              driver: {
                create: {
                  licenseNumber: `PENDING-${phone}`,
                },
              },
            }
          : {}),
      },
    });

    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  async login(dto: LoginDto) {
    const phone = normalizeVnPhone(dto.phone) ? this.canonicalPhone(dto.phone) : dto.phone;
    const failKey = `login:fail:${phone}`;
    const failures = Number((await this.redis.client.get(failKey)) ?? 0);
    if (failures >= MAX_LOGIN_FAILURES) {
      const ttl = await this.redis.client.ttl(failKey);
      throw new HttpException(`Tài khoản tạm khoá do đăng nhập sai nhiều lần, thử lại sau ${Math.ceil(Math.max(ttl, 1) / 60)} phút`, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { phone } });
    const passwordValid = user ? await bcrypt.compare(dto.password, user.passwordHash) : false;
    if (!user || !passwordValid) {
      const n = await this.redis.client.incr(failKey);
      if (n === 1) await this.redis.client.expire(failKey, LOCKOUT_SECS);
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }

    await this.redis.client.del(failKey);
    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  async refresh(refreshToken: string) {
    const userId = await this.tokens.consumeRefresh(refreshToken);
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('Tài khoản không tồn tại');
    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  /** Invalidates the current access token and the given refresh token (or every session with `everywhere`). */
  async logout(access: AccessPayload, refreshToken?: string, everywhere = false) {
    await this.tokens.blockAccess(access);
    if (everywhere) await this.tokens.revokeAllRefresh(access.sub);
    else if (refreshToken) await this.tokens.revokeRefresh(refreshToken);
    return { ok: true };
  }

  /** Forgot password: requires an OTP verification token with purpose RESET_PASSWORD. */
  async resetPassword(dto: ResetPasswordDto) {
    const phone = this.canonicalPhone(dto.phone);
    this.otp.assertVerified(dto.verificationToken, phone, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('Số điện thoại chưa đăng ký');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    // A password reset ends every other session.
    await this.tokens.revokeAllRefresh(user.id);
    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  private async buildAuthResponse(userId: string, phone: string, role: string, fullName: string) {
    const { accessToken, refreshToken } = await this.tokens.issuePair({ id: userId, phone, role });
    return {
      accessToken,
      refreshToken,
      expiresIn: this.tokens.accessTtl,
      user: { id: userId, phone, role, fullName },
    };
  }
}
