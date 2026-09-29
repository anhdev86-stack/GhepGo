import { Global, Module } from '@nestjs/common';
import { WalletService } from './wallet.service.js';
import { WalletController } from './wallet.controller.js';

@Global()
@Module({
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
