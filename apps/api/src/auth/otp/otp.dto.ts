import { IsEnum, IsNotEmpty, IsString, Length, MinLength } from 'class-validator';

export enum OtpPurposeDto {
  REGISTER = 'REGISTER',
  RESET_PASSWORD = 'RESET_PASSWORD',
}

export class SendOtpDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsEnum(OtpPurposeDto)
  purpose: OtpPurposeDto;
}

export class VerifyOtpDto extends SendOtpDto {
  @IsString()
  @Length(6, 6)
  code: string;
}

export class ResetPasswordDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  verificationToken: string;

  @IsString()
  @MinLength(6)
  newPassword: string;
}
