import { Body, Controller, Get, Headers, HttpCode, Ip, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  topup(@CurrentUser() user: AuthUser, @Body() dto: TopupDto, @Ip() ip: string, @Headers('origin') origin?: string) {
    const base = process.env.WEB_URL ?? origin ?? 'http://localhost:3000';
    return this.wallet.createTopup(user.userId, dto, base, ip?.replace('::ffff:', '') || '127.0.0.1');
  }

  /** VNPay IPN — VNPay calls this server-to-server with GET query params. */
  @Get('vnpay/ipn')
  vnpayIpn(@Query() params: Record<string, string>) {
    return this.wallet.handleVnpayIpn(params);
  }

  /** VNPay Return URL — the web page forwards the redirect query here to show the result. */
  @Get('vnpay/return')
  vnpayReturn(@Query() params: Record<string, string>) {
    return this.wallet.handleVnpayReturn(params);
  }

  /** MoMo IPN — POST JSON; MoMo expects HTTP 204 with an empty body. */
  @Post('momo/ipn')
  @HttpCode(204)
  async momoIpn(@Body() params: Record<string, string | number>) {
    await this.wallet.handleMomoIpn(params);
  }

  @Get('momo/return')
  momoReturn(@Query() params: Record<string, string>) {
    return this.wallet.handleMomoReturn(params);
  }

  @Get('gateway')
  @UseGuards(JwtAuthGuard)
  gateway() {
    return { gateway: this.wallet.gateway, available: this.wallet.availableGateways() };
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
