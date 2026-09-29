import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { VehiclesService } from './vehicles.service.js';
import { CreateVehicleDto } from './dto/create-vehicle.dto.js';

@Controller('vehicles')
@UseGuards(JwtAuthGuard, RolesGuard)
export class VehiclesController {
  constructor(private vehiclesService: VehiclesService) {}

  @Post()
  @Roles('DRIVER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateVehicleDto) {
    return this.vehiclesService.create(user.userId, dto);
  }

  @Get('mine')
  @Roles('DRIVER')
  findMine(@CurrentUser() user: AuthUser) {
    return this.vehiclesService.findMine(user.userId);
  }

  @Get()
  @Roles('ADMIN')
  findAll() {
    return this.vehiclesService.findAll();
  }

  @Delete(':id')
  @Roles('DRIVER')
  remove(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.vehiclesService.remove(user.userId, id);
  }
}
