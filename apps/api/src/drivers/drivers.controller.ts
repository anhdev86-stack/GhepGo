import { Body, Controller, Get, Patch, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { DriversService } from './drivers.service.js';
import { UpdateDriverStatusDto } from './dto/update-status.dto.js';
import { UpdateDriverLocationDto } from './dto/update-location.dto.js';

@Controller('drivers')
@UseGuards(JwtAuthGuard, RolesGuard)
export class DriversController {
  constructor(private driversService: DriversService) {}

  @Get('me')
  @Roles('DRIVER')
  me(@CurrentUser() user: AuthUser) {
    return this.driversService.findByUserId(user.userId);
  }

  @Patch('me/status')
  @Roles('DRIVER')
  updateStatus(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverStatusDto) {
    return this.driversService.updateStatus(user.userId, dto);
  }

  @Patch('me/location')
  @Roles('DRIVER')
  updateLocation(@CurrentUser() user: AuthUser, @Body() dto: UpdateDriverLocationDto) {
    return this.driversService.updateLocation(user.userId, dto);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.driversService.findAll();
  }
}
