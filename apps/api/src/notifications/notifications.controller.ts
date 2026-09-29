import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsEnum, IsNotEmpty, IsObject, IsOptional, IsString } from 'class-validator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { NotificationsService } from './notifications.service.js';

class RegisterDeviceDto {
  @IsEnum(['EXPO', 'WEBPUSH'])
  kind: 'EXPO' | 'WEBPUSH';

  /** Expo token, or the Web Push endpoint URL. */
  @IsString()
  @IsNotEmpty()
  token: string;

  @IsOptional()
  @IsObject()
  subscription?: Record<string, unknown>;

  @IsOptional()
  @IsString()
  platform?: string;
}

@Controller('notifications')
@UseGuards(JwtAuthGuard)
export class NotificationsController {
  constructor(private notifications: NotificationsService) {}

  @Get('vapid-public-key')
  vapid() {
    return { publicKey: this.notifications.vapidPublicKey };
  }

  @Post('devices')
  async register(@CurrentUser() user: AuthUser, @Body() dto: RegisterDeviceDto) {
    if (dto.kind === 'WEBPUSH' && !dto.subscription) throw new BadRequestException('Thiếu subscription');
    try {
      return await this.notifications.registerDevice(user.userId, dto);
    } catch (err) {
      throw new BadRequestException((err as Error).message);
    }
  }

  @Delete('devices/:token')
  remove(@CurrentUser() user: AuthUser, @Param('token') token: string) {
    return this.notifications.removeDevice(user.userId, decodeURIComponent(token));
  }

  @Get()
  list(@CurrentUser() user: AuthUser, @Query('unread') unread?: string) {
    return this.notifications.list(user.userId, unread === '1' || unread === 'true');
  }

  @Get('unread-count')
  async unread(@CurrentUser() user: AuthUser) {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Patch('read-all')
  readAll(@CurrentUser() user: AuthUser) {
    return this.notifications.markAllRead(user.userId);
  }

  @Patch(':id/read')
  read(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.notifications.markRead(user.userId, id);
  }

  /** Sends a test push to the caller's own devices. */
  @Post('test')
  async test(@CurrentUser() user: AuthUser) {
    await this.notifications.sendToUser(user.userId, {
      title: 'GhepGo',
      body: 'Thông báo đẩy đã hoạt động trên thiết bị này.',
      data: { screen: 'home' },
    });
    return { ok: true };
  }
}
