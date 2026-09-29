import { Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { TripGroupsService } from './trip-groups.service.js';

@Controller('trip-groups')
@UseGuards(JwtAuthGuard, RolesGuard)
export class TripGroupsController {
  constructor(private tripGroupsService: TripGroupsService) {}

  @Get('available')
  @Roles('DRIVER')
  findAvailable(@CurrentUser() user: AuthUser) {
    return this.tripGroupsService.findAvailable(user.userId);
  }

  @Get('mine')
  @Roles('DRIVER')
  findMine(@CurrentUser() user: AuthUser) {
    return this.tripGroupsService.findMyGroups(user.userId);
  }

  @Post(':id/accept')
  @Roles('DRIVER')
  accept(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripGroupsService.accept(user.userId, id);
  }

  @Patch(':id/advance')
  @Roles('DRIVER')
  advance(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.tripGroupsService.advanceStop(user.userId, id);
  }
}
