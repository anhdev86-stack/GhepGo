import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsLatitude, IsLongitude, IsOptional, IsString, MinLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { GeoService } from './geo.service.js';

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

class RouteQuery {
  @Type(() => Number) @IsLatitude() fromLat: number;
  @Type(() => Number) @IsLongitude() fromLng: number;
  @Type(() => Number) @IsLatitude() toLat: number;
  @Type(() => Number) @IsLongitude() toLng: number;
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

  @Get('route')
  route(@Query() q: RouteQuery) {
    return this.geo.route([
      { lat: q.fromLat, lng: q.fromLng },
      { lat: q.toLat, lng: q.toLng },
    ]);
  }

  @Get('provider')
  provider() {
    return { provider: this.geo.providerName };
  }
}
