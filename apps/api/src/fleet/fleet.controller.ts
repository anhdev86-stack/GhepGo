import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { FleetService } from './fleet.service.js';
import { AssignZoneDto, CreateZoneDto, RateTripDto, ReportQueryDto, UpdateZoneDto } from './fleet.dto.js';
import { NearbyDriversQueryDto } from '../drivers/dto/nearby-query.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class FleetController {
  constructor(private fleet: FleetService) {}

  // driver self-service
  @Get('drivers/me/stats')
  @Roles('DRIVER')
  myStats(@CurrentUser() user: AuthUser, @Query() q: ReportQueryDto) {
    return this.fleet.driverStatsByUser(user.userId, q.from, q.to);
  }

  @Get('drivers/me/shifts')
  @Roles('DRIVER')
  myShifts(@CurrentUser() user: AuthUser) {
    return this.fleet.myShifts(user.userId);
  }

  /** Any signed-in user: is a point inside the service area? (booking screen) */
  @Get('zones/coverage')
  coverage(@Query() q: NearbyDriversQueryDto) {
    return this.fleet.coverage(q.lat, q.lng);
  }

  @Get('zones')
  publicZones() {
    return this.fleet
      .listZones()
      .then((zs) => zs.filter((z) => z.isActive).map(({ id, name, centerLat, centerLng, radiusKm, polygon, areaKm2 }) => ({ id, name, centerLat, centerLng, radiusKm, polygon, areaKm2 })));
  }

  // customer
  @Post('trips/:id/rating')
  @Roles('CUSTOMER')
  rate(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: RateTripDto) {
    return this.fleet.rateTrip(user.userId, id, dto);
  }

  // admin
  @Get('admin/reports/overview')
  @Roles('ADMIN')
  overview(@Query() q: ReportQueryDto) {
    return this.fleet.overview(q.from, q.to);
  }

  @Get('admin/drivers/:id/stats')
  @Roles('ADMIN')
  driverStats(@Param('id') id: string, @Query() q: ReportQueryDto) {
    return this.fleet.driverStats(id, q.from, q.to);
  }

  @Get('admin/zones')
  @Roles('ADMIN')
  zones() {
    return this.fleet.listZones();
  }

  @Post('admin/zones')
  @Roles('ADMIN')
  createZone(@Body() dto: CreateZoneDto) {
    return this.fleet.createZone(dto);
  }

  @Patch('admin/zones/:id')
  @Roles('ADMIN')
  updateZone(@Param('id') id: string, @Body() dto: UpdateZoneDto) {
    return this.fleet.updateZone(id, dto);
  }

  @Delete('admin/zones/:id')
  @Roles('ADMIN')
  deleteZone(@Param('id') id: string) {
    return this.fleet.deleteZone(id);
  }

  @Get('admin/reports/zones')
  @Roles('ADMIN')
  zoneStats(@Query() q: ReportQueryDto) {
    return this.fleet.zoneStats(q.from, q.to);
  }

  @Patch('admin/drivers/:id/zone')
  @Roles('ADMIN')
  assignZone(@Param('id') id: string, @Body() dto: AssignZoneDto) {
    return this.fleet.assignZone(id, dto.zoneId ?? null);
  }
}
