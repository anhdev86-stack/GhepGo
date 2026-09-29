import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsLatitude, IsLongitude, IsNotEmpty, IsNumber, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

export class CreateZoneDto {
  @IsString() @IsNotEmpty() @MaxLength(100) name: string;
  /** Circle fallback; may be omitted when a polygon is given (centroid is used). */
  @IsOptional() @Type(() => Number) @IsLatitude() centerLat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() centerLng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(200) radiusKm?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** GeoJSON Polygon / Feature, a [lng,lat] ring, or [lat,lng] pairs. */
  @IsOptional() polygon?: unknown;
}

export class AssignZoneDto {
  @IsOptional() @IsString() zoneId?: string | null;
}

export class RateTripDto {
  @Type(() => Number) @IsInt() @Min(1) @Max(5) score: number;
  @IsOptional() @IsString() @MaxLength(500) comment?: string;
}

export class ReportQueryDto {
  @IsOptional() @IsString() from?: string;
  @IsOptional() @IsString() to?: string;
}

export class UpdateZoneDto {
  @IsOptional() @IsString() @IsNotEmpty() @MaxLength(100) name?: string;
  @IsOptional() @Type(() => Number) @IsLatitude() centerLat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() centerLng?: number;
  @IsOptional() @Type(() => Number) @IsNumber() @Min(0.5) @Max(200) radiusKm?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  /** New polygon, or null to remove it and fall back to the circle. */
  @IsOptional() polygon?: unknown;
}
