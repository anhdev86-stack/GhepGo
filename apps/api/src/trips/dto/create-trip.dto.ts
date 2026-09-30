import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export enum TripTypeDto {
  PRIVATE = 'PRIVATE',
  SHARED = 'SHARED',
}

export enum PaymentMethodDto {
  CASH = 'CASH',
  WALLET = 'WALLET',
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

  @IsOptional()
  @IsEnum(PaymentMethodDto)
  paymentMethod?: PaymentMethodDto;

  /** Promotion code; booking fails with 400 when it cannot be applied. */
  @IsOptional()
  @IsString()
  @MaxLength(32)
  promoCode?: string;
}
