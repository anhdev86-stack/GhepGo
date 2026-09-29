import { IsEnum } from 'class-validator';

export enum DriverStatusDto {
  OFFLINE = 'OFFLINE',
  AVAILABLE = 'AVAILABLE',
}

export class UpdateDriverStatusDto {
  @IsEnum(DriverStatusDto)
  status: DriverStatusDto;
}
