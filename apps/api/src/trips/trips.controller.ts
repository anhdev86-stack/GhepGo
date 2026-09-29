import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { TripsService } from './trips.service.js';
import { CreateTripDto } from './dto/create-trip.dto.js';
import { UpdateTripStatusDto } from './dto/update-trip-status.dto.js';

@Controller('trips')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripsController {
  constructor(private tripsService: TripsService) {}

  @Post()
  @Roles('CUSTOMER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateTripDto) {
    return this.tripsService.create(user.userId, dto);
  }

  @Get('mine')
  @Roles('CUSTOMER')
  findMine(@CurrentUser() user: AuthUser) {
    return this.tripsService.findMine(user.userId);
  }

  @Get('available')
  @Roles('DRIVER')
  findAvailable(@CurrentUser() user: AuthUser) {
    return this.tripsService.findAvailableForDrivers(user.userId);
  }

  @Get('driver/mine')
  @Roles('DRIVER')
  findMyDriverTrips(@CurrentUser() user: AuthUser) {
    return this.tripsService.findMyDriverTrips(user.userId);
  }

  @Post(':id/accept')
  @Roles('DRIVER')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.accept(user.userId, id);
  }

  @Patch(':id/status')
  @Roles('DRIVER')
  updateStatus(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() dto: UpdateTripStatusDto,
  ) {
    return this.tripsService.updateStatus(user.userId, id, dto);
  }

  @Post(':id/cancel')
  @Roles('CUSTOMER')
  cancel(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.cancelByCustomer(user.userId, id);
  }

  @Get('all')
  @Roles('ADMIN')
  findAll() {
    return this.tripsService.findAll();
  }

  @Get(':id')
  @Roles('CUSTOMER', 'DRIVER', 'ADMIN')
  findOne(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripsService.findOne(id, user.userId, user.role);
  }
}
