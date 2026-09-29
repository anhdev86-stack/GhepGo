import { BadRequestException, Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GeoService } from './geo.service.js';

/** Upper bound on waypoints per routing call (a full carpool group is ≤ 10 stops). */
const MAX_ROUTE_POINTS = 25;

class AutocompleteQuery {
  @IsString()
  @MinLength(2)
  q: string;

  @IsOptional()
  @Type(() => Number)
  @IsLatitude()
  lat?: number;

  @IsOptional()
  @Type(() => Number)
  @IsLongitude()
  lng?: number;
}

class ReverseQuery {
  @Type(() => Number) @IsLatitude() lat: number;
  @Type(() => Number) @IsLongitude() lng: number;
}

/**
 * Either `fromLat/fromLng/toLat/toLng` (two points) or `points=lat,lng;lat,lng;...`
 * (ordered waypoints, e.g. the stops of a carpool group).
 */
class RouteQuery {
  @IsOptional() @Type(() => Number) @IsLatitude() fromLat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() fromLng?: number;
  @IsOptional() @Type(() => Number) @IsLatitude() toLat?: number;
  @IsOptional() @Type(() => Number) @IsLongitude() toLng?: number;
  @IsOptional() @IsString() points?: string;
}

export function parseRoutePoints(q: RouteQuery): { lat: number; lng: number }[] {
  if (q.points) {
    const pts = q.points
      .split(';')
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const [lat, lng] = s.split(',').map(Number);
        if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
          throw new BadRequestException(`Toạ độ không hợp lệ: "${s}"`);
        }
        return { lat, lng };
      });
    if (pts.length < 2) throw new BadRequestException('Cần ít nhất 2 điểm');
    if (pts.length > MAX_ROUTE_POINTS) throw new BadRequestException(`Tối đa ${MAX_ROUTE_POINTS} điểm`);
    return pts;
  }
  if (q.fromLat == null || q.fromLng == null || q.toLat == null || q.toLng == null) {
    throw new BadRequestException('Thiếu toạ độ: cần fromLat/fromLng/toLat/toLng hoặc points');
  }
  return [
    { lat: q.fromLat, lng: q.fromLng },
    { lat: q.toLat, lng: q.toLng },
  ];
}

@Controller('geo')
@UseGuards(JwtAuthGuard)
export class GeoController {
  constructor(private geo: GeoService) {}

  @Get('autocomplete')
  autocomplete(@Query() q: AutocompleteQuery) {
    const near = q.lat != null && q.lng != null ? { lat: q.lat, lng: q.lng } : undefined;
    return this.geo.autocomplete(q.q, near);
  }

  /** Address for a coordinate; `place` is null when the provider has nothing (client keeps "lat, lng"). */
  @Get('reverse')
  async reverse(@Query() q: ReverseQuery) {
    return { place: await this.geo.reverse(q.lat, q.lng) };
  }

  @Get('route')
  route(@Query() q: RouteQuery) {
    return this.geo.route(parseRoutePoints(q));
  }

  /** Provider name + raster tile layer for the map UI. */
  @Get('provider')
  provider() {
    return this.geo.config();
  }
}
