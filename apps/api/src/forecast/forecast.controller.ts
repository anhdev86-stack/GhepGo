import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsISO8601, IsLatitude, IsLongitude, IsOptional, IsString, Max, Min } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { ForecastService } from './forecast.service.js';

class ForecastQueryDto {
  @IsOptional() @IsString() zoneId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(168) horizon?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) weeks?: number;
}

class HotspotsQueryDto {
  @IsOptional() @IsString() zoneId?: string;
  /** Slot start; defaults to now. */
  @IsOptional() @IsISO8601() at?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) hours?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(12) weeks?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) limit?: number;
  @IsOptional() @Type(() => Number) @IsLatitude() lat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() lng?: number;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ForecastController {
  constructor(private forecast: ForecastService) {}

  /** 7 × 24 demand / supply profile (weighted over recent weeks). */
  @Get('admin/forecast/profile')
  @Roles('ADMIN')
  profile(@Query() q: ForecastQueryDto) {
    return this.forecast.profile(q.zoneId ?? null, q.weeks ?? 8);
  }

  /** Next hours: demand vs. expected supply/capacity and the staffing gap. */
  @Get('admin/forecast')
  @Roles('ADMIN')
  next(@Query() q: ForecastQueryDto) {
    return this.forecast.forecast(q.zoneId ?? null, q.horizon ?? 24, q.weeks ?? 8);
  }

  /** Pickup hotspots for a time slot with live driver counts. */
  @Get('admin/forecast/hotspots')
  @Roles('ADMIN')
  hotspots(@Query() q: HotspotsQueryDto) {
    return this.forecast.hotspots({
      zoneId: q.zoneId ?? null,
      at: q.at ? new Date(q.at) : undefined,
      hours: q.hours,
      weeks: q.weeks,
      limit: q.limit,
      near: q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : null,
    });
  }

  /** Where an idle driver should head: hotspots in their zone ranked from their position. */
  @Get('drivers/me/hotspots')
  @Roles('DRIVER')
  mine(@CurrentUser() user: AuthUser, @Query('limit') limit?: string) {
    return this.forecast.hotspotsForDriver(user.userId, limit ? Math.min(20, Math.max(1, Number(limit) || 5)) : 5);
  }
}
