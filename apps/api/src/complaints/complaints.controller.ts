import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { ComplaintsService, CATEGORY_LABEL } from './complaints.service.js';
import { AddMessageDto, AdminListQueryDto, AssignComplaintDto, CreateComplaintDto, ResolveComplaintDto, SetPriorityDto } from './complaints.dto.js';
import { ReportQueryDto } from '../fleet/fleet.dto.js';
import { PRIORITY_LABEL } from './sla.js';

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

  // ---------------- admin ----------------

  /** Filters: status (or ACTIVE), assignee (me | unassigned | id), priority, overdue=1. */
  @Get('admin/complaints')
  @Roles('ADMIN')
  all(@CurrentUser() user: AuthUser, @Query() q: AdminListQueryDto) {
    return this.complaints.listAll(q, user.userId);
  }

  /** Admins with active / overdue load, for the assignment picker. */
  @Get('admin/complaints/staff')
  @Roles('ADMIN')
  staff() {
    return this.complaints.staff();
  }

  /** SLA attainment in a window + live backlog + the active policy. */
  @Get('admin/complaints/sla')
  @Roles('ADMIN')
  sla(@Query() q: ReportQueryDto) {
    return this.complaints.slaReport(q.from, q.to);
  }

  @Get('admin/complaints/priorities')
  @Roles('ADMIN')
  priorities() {
    return Object.entries(PRIORITY_LABEL).map(([value, label]) => ({ value, label, ...this.complaints.policy[value as keyof typeof PRIORITY_LABEL] }));
  }

  /** Manual trigger of the overdue sweep (admin / tests). */
  @Post('admin/complaints/sweep')
  @Roles('ADMIN')
  sweep() {
    return this.complaints.sweepOverdue();
  }

  @Patch('admin/complaints/:id/assign')
  @Roles('ADMIN')
  assign(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: AssignComplaintDto) {
    return this.complaints.assign(id, user.userId, dto.assigneeId ?? null);
  }

  @Patch('admin/complaints/:id/priority')
  @Roles('ADMIN')
  priority(@Param('id') id: string, @Body() dto: SetPriorityDto) {
    return this.complaints.setPriority(id, dto.priority);
  }

  @Patch('admin/complaints/:id')
  @Roles('ADMIN')
  resolve(@CurrentUser() user: AuthUser, @Param('id') id: string, @Body() dto: ResolveComplaintDto) {
    return this.complaints.resolve(id, user.userId, dto);
  }
}
