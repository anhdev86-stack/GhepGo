import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { VnpayService } from './vnpay.service.js';
import { MomoService } from './momo.service.js';

@Global()
@Module({
  controllers: [WalletController],
  providers: [WalletService, VnpayService, MomoService],
  exports: [WalletService, VnpayService, MomoService],
})
export class WalletModule {}
