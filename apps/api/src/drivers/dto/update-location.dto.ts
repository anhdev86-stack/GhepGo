import { IsLatitude, IsLongitude, IsNumber, IsOptional, Max, Min } from 'class-validator';

export class UpdateDriverLocationDto {
  @IsLatitude()
  lat: number;

  @IsLongitude()
  lng: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(360)
  heading?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  speed?: number;
}
