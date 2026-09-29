import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { IsNotEmpty, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { NearbyDriversQueryDto } from '../drivers/dto/nearby-query.dto.js';
import { ZonesService } from '../zones/zones.service.js';
import { DispatchService } from './dispatch.service.js';

class OfferDto {
  @IsString()
  @IsNotEmpty()
  driverId: string;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class DispatchController {
  constructor(
    private dispatch: DispatchService,
    private zones: ZonesService,
  ) {}

  /** Ranked nearest drivers for a pickup point (customer booking screen, admin). */
  @Get('dispatch/suggest')
  @Roles('CUSTOMER', 'ADMIN')
  async suggest(@Query() q: NearbyDriversQueryDto) {
    const zone = await this.zones.resolve(q.lat, q.lng);
    return this.dispatch.suggestDrivers(q.lat, q.lng, zone?.id ?? null, q.radius ?? 7000);
  }

  @Post('admin/trips/:id/offer')
  @Roles('ADMIN')
  offer(@Param('id') id: string, @Body() dto: OfferDto) {
    return this.dispatch.offer(id, dto.driverId);
  }

  /** Manual trigger of the expiry sweep (admin / tests). */
  @Post('admin/dispatch/expire')
  @Roles('ADMIN')
  expire() {
    return this.dispatch.expireStale();
  }

  @Get('admin/dispatch/config')
  @Roles('ADMIN')
  config() {
    return { tripRequestTtlMin: this.dispatch.requestTtlMin, groupMatchingTtlMin: this.dispatch.groupTtlMin };
  }
}
