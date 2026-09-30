import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';

/** Paging for GET /trips/mine: newest first, cursor = id of the last trip already shown. */
export class MyTripsQueryDto {
  @IsOptional() @IsIn(['all', 'active', 'history']) scope?: 'all' | 'active' | 'history';
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) take?: number;
  @IsOptional() @IsString() @MaxLength(64) cursor?: string;
}
