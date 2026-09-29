import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import type { AccessPayload } from './token.service.js';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from './otp/otp.service.js';
import { ResetPasswordDto, SendOtpDto, VerifyOtpDto } from './otp/otp.dto.js';

class RefreshDto {
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

class LogoutDto {
  @IsOptional()
  @IsString()
  refreshToken?: string;

  @IsOptional()
  @IsBoolean()
  everywhere?: boolean;
}

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private otp: OtpService,
  ) {}

  /** Step 1 of register / reset: text a 6-digit code to the phone. */
  @Post('otp/send')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  sendOtp(@Body() dto: SendOtpDto) {
    return this.otp.send(dto.phone, dto.purpose);
  }

  /** Step 2: exchange the code for a short-lived verification token. */
  @Post('otp/verify')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  verifyOtp(@Body() dto: VerifyOtpDto) {
    return this.otp.verify(dto.phone, dto.code, dto.purpose);
  }

  @Post('password/reset')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto);
  }

  @Get('config')
  config() {
    return { otpRequired: this.otp.required };
  }

  @Post('register')
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  /** Rotates the refresh token and returns a new access token. */
  @Post('refresh')
  @Throttle({ default: { limit: 30, ttl: 60_000 } })
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @Post('logout')
  @UseGuards(JwtAuthGuard)
  logout(@Req() req: { user: AccessPayload & { userId: string } }, @Body() dto: LogoutDto) {
    const u = req.user;
    return this.authService.logout({ sub: u.userId, phone: u.phone, role: u.role, jti: u.jti, exp: u.exp }, dto.refreshToken, dto.everywhere);
  }
}
