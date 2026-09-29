import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';

@Injectable()
export class AuthService {
  constructor(
    private prisma: PrismaService,
    private jwt: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (existing) {
      throw new ConflictException('Số điện thoại đã được đăng ký');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        phone: dto.phone,
        passwordHash,
        fullName: dto.fullName,
        role: dto.role,
        wallet: { create: { balance: 0 } },
        ...(dto.role === 'DRIVER'
          ? {
              driver: {
                create: {
                  licenseNumber: `PENDING-${dto.phone}`,
                },
              },
            }
          : {}),
      },
    });

    return this.buildAuthResponse(user.id, user.phone, user.role, user.fullName);
  }

  async login(dto: LoginDto) {
    const user = await this.prisma.user.findUnique({ where: { phone: dto.phone } });
    if (!user) {
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }

    const passwordValid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!passwordValid) {
      throw new UnauthorizedException('Sai số điện thoại hoặc mật khẩu');
    }

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
