import { Body, Controller, Get, Post } from '@nestjs/common';
import { AuthService } from './auth.service.js';
import { RegisterDto } from './dto/register.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { OtpService } from './otp/otp.service.js';
import { ResetPasswordDto, SendOtpDto, VerifyOtpDto } from './otp/otp.dto.js';

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private otp: OtpService,
  ) {}

  /** Step 1 of register / reset: text a 6-digit code to the phone. */
  @Post('otp/send')
  sendOtp(@Body() dto: SendOtpDto) {
    return this.otp.send(dto.phone, dto.purpose);
  }

  /** Step 2: exchange the code for a short-lived verification token. */
  @Post('otp/verify')
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
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }
}
