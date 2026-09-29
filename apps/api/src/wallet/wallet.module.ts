import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';
import { VnpayService } from './vnpay.service.js';

@Global()
@Module({
  controllers: [WalletController],
  providers: [WalletService, VnpayService],
  exports: [WalletService, VnpayService],
})
export class WalletModule {}
