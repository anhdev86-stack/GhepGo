import { Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsInt, IsISO8601, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class QuoteQueryDto {
  @Type(() => Number) @IsLatitude() fromLat: number;
  @Type(() => Number) @IsLongitude() fromLng: number;
  @Type(() => Number) @IsLatitude() toLat: number;
  @Type(() => Number) @IsLongitude() toLng: number;
  @IsOptional() @IsEnum(['PRIVATE', 'SHARED']) tripType?: 'PRIVATE' | 'SHARED';
  @IsOptional() @IsString() @MaxLength(32) promoCode?: string;
}

export class PricingRuleBodyDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  /** Zone id, or null for the global default. */
  @IsOptional() @IsString() zoneId?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) baseFare?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perKm?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) perMinute?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minFare?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10000) roundTo?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(90) sharedDiscountPct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(200) nightSurchargePct?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) nightStartHour?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(23) nightEndHour?: number;
  @IsOptional() @IsBoolean() surgeEnabled?: boolean;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(1) @Max(5) surgeMax?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) cancellationFee?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class PromotionBodyDto {
  @IsOptional() @IsString() @Matches(/^[A-Z0-9_-]{3,32}$/, { message: 'Mã gồm 3–32 ký tự A–Z, 0–9, _ hoặc -' }) code?: string;
  @IsOptional() @IsString() @MaxLength(200) description?: string;
  @IsOptional() @IsEnum(['PERCENT', 'FIXED']) type?: 'PERCENT' | 'FIXED';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) value?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) maxDiscount?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) minFare?: number;
  @IsOptional() @IsEnum(['PRIVATE', 'SHARED']) tripType?: 'PRIVATE' | 'SHARED' | null;
  @IsOptional() @IsBoolean() firstRideOnly?: boolean;
  @IsOptional() @IsISO8601() startsAt?: string | null;
  @IsOptional() @IsISO8601() endsAt?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) usageLimit?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) perUserLimit?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
