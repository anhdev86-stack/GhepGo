import { IsEnum } from 'class-validator';

export enum DriverTripStatusDto {
  EN_ROUTE_TO_PICKUP = 'EN_ROUTE_TO_PICKUP',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED',
  CANCELLED = 'CANCELLED',
}

export class UpdateTripStatusDto {
  @IsEnum(DriverTripStatusDto)
  status: DriverTripStatusDto;
}
