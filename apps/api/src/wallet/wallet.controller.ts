import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { Roles } from '../auth/decorators/roles.decorator.js';
import { CurrentUser } from '../auth/decorators/current-user.decorator.js';
import type { AuthUser } from '../auth/decorators/current-user.decorator.js';
import { WalletService } from './wallet.service.js';
import { ResolveWithdrawalDto, TopupCallbackDto, TopupDto, WithdrawDto } from './wallet.dto.js';

@Controller('wallet')
export class WalletController {
  constructor(private wallet: WalletService) {}

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.wallet.getMine(user.userId);
  }

  @Get('me/transactions')
  @UseGuards(JwtAuthGuard)
  transactions(@CurrentUser() user: AuthUser) {
    return this.wallet.transactions(user.userId);
  }

  @Post('topup')
  @UseGuards(JwtAuthGuard)
  topup(@CurrentUser() user: AuthUser, @Body() dto: TopupDto, @Headers('origin') origin?: string) {
    const base = origin ?? process.env.WEB_URL ?? 'http://localhost:3000';
    return this.wallet.createTopup(user.userId, dto, base);
  }

  /** Gateway IPN (no JWT — authenticated by HMAC signature). */
  @Post('topup/callback')
  topupCallback(@Body() dto: TopupCallbackDto) {
    return this.wallet.handleTopupCallback(dto);
  }

  /** Dev helper: sign a callback the way the (mock) gateway would. Disabled in production. */
  @Post('topup/mock-sign')
  @UseGuards(JwtAuthGuard)
  mockSign(@Body() body: { txId: string; result: 'SUCCESS' | 'FAILED'; gatewayRef: string }) {
    if (process.env.NODE_ENV === 'production') return { error: 'disabled' };
    return { signature: this.wallet.sign(body.txId, body.result, body.gatewayRef) };
  }

  @Post('trips/:id/confirm-cash')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  confirmCash(@CurrentUser() user: AuthUser, @Param('id') id: string) {
    return this.wallet.confirmCash(user.userId, id);
  }

  @Post('withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  withdraw(@CurrentUser() user: AuthUser, @Body() dto: WithdrawDto) {
    return this.wallet.requestWithdrawal(user.userId, dto);
  }

  @Get('withdrawals/mine')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('DRIVER')
  myWithdrawals(@CurrentUser() user: AuthUser) {
    return this.wallet.myWithdrawals(user.userId);
  }

  @Get('withdrawals')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  listWithdrawals(@Query('status') status?: string) {
    return this.wallet.listWithdrawals(status);
  }

  @Patch('withdrawals/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('ADMIN')
  resolve(@Param('id') id: string, @Body() dto: ResolveWithdrawalDto) {
    return this.wallet.resolveWithdrawal(id, dto);
  }
}
