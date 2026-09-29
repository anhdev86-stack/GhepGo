import { BadRequestException, ConflictException, Injectable, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from './otp/otp.service.js';
import { normalizeVnPhone, toLocalVnPhone } from '../common/phone.util.js';
import type { ResetPasswordDto } from './otp/otp.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
    private otp: OtpService,
  ) {}

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
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) {
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }

    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  /** Forgot password: requires an OTP verification token with purpose RESET_PASSWORD. */
  async resetPassword(dto: ResetPasswordDto) {
    const phone = this.canonicalPhone(dto.phone);
    this.otp.assertVerified(dto.verificationToken, phone, 'RESET_PASSWORD');
    const user = await this.prisma.user.findUnique({ where: { phone } });
    if (!user) throw new NotFoundException('Số điện thoại chưa đăng ký');
    const passwordHash = await bcrypt.hash(dto.newPassword, 10);
    await this.prisma.user.update({ where: { id: user.id }, data: { passwordHash } });
    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  private buildAuthResponse(userId: string, phone: string, role: string, fullName: string) {
    const accessToken = this.jwt.sign({ sub: userId, phone, role });
    return {
      accessToken,
      user: { id: userId, phone, role, fullName },
    };
  }
}
