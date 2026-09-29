import { Type } from 'class-transformer';
import { IsInt, IsLatitude, IsLongitude, IsOptional, Max, Min } from 'class-validator';

export class NearbyDriversQueryDto {
  @Type(() => Number)
  @IsLatitude()
  lat: number;

  @Type(() => Number)
  @IsLongitude()
  lng: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(100)
  @Max(50000)
  radius?: number;
}
