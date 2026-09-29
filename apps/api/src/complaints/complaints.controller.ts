import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { ComplaintsService, CATEGORY_LABEL } from './complaints.service.js';
import { AddMessageDto, CreateComplaintDto, ResolveComplaintDto } from './complaints.dto.js';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class ComplaintsController {
  constructor(private complaints: ComplaintsService) {}

  @Get('complaints/categories')
  categories() {
    return Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }));
  }

  @Post('complaints')
  @Roles('CUSTOMER', 'DRIVER')
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateComplaintDto) {
    return this.complaints.create(user.userId, dto);
  }

  @Get('complaints/mine')
  @Roles('CUSTOMER', 'DRIVER')
  mine(@CurrentUser() user: AuthUser) {
    return this.complaints.listMine(user.userId);
  }

  @Get('complaints/:id')
  get(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.complaints.get(id, user.userId, user.role);
  }

  @Post('complaints/:id/messages')
  message(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AddMessageDto) {
    return this.complaints.addMessage(id, user.userId, user.role, dto);
  }

  @Get('admin/complaints')
  @Roles('ADMIN')
  all(@Query('status') status?: string) {
    return this.complaints.listAll(status);
  }

  @Patch('admin/complaints/:id')
  @Roles('ADMIN')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveComplaintDto) {
    return this.complaints.resolve(id, user.userId, dto);
  }
}
