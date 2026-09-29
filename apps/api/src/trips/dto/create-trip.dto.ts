import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, Min } from 'class-validator';

export enum TripTypeDto {
  PRIVATE = 'PRIVATE',
  SHARED = 'SHARED',
}

export class CreateTripDto {
  @IsString()
  @IsNotEmpty()
  pickupAddress: string;

  @IsLatitude()
  pickupLat: number;

  @IsLongitude()
  pickupLng: number;

  @IsString()
  @IsNotEmpty()
  dropoffAddress: string;

  @IsLatitude()
  dropoffLat: number;

  @IsLongitude()
  dropoffLng: number;

  @IsEnum(TripTypeDto)
  tripType: TripTypeDto;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3)
  seatsRequested?: number;
}
