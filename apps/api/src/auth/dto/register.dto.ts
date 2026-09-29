import { IsEnum, IsNotEmpty, IsString, MinLength } from 'class-validator';

export enum RegisterRole {
  CUSTOMER = 'CUSTOMER',
  DRIVER = 'DRIVER',
}

export class RegisterDto {
  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @MinLength(6)
  password: string;

  @IsString()
  @IsNotEmpty()
  fullName: string;

  @IsEnum(RegisterRole)
  role: RegisterRole;
}
