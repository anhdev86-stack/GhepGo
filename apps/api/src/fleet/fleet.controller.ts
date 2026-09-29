import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { FleetService } from './fleet.service.js';
import { AssignZoneDto, CreateZoneDto, RateTripDto, ReportQueryDto } from './fleet.dto.js';

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

  @Patch('admin/drivers/:id/zone')
  @Roles('ADMIN')
  assignZone(@Param('id') id: string, @Body() dto: AssignZoneDto) {
    return this.fleet.assignZone(id, dto.zoneId ?? null);
  }
}
