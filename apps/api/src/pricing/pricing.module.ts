import { Global, Module } from '@nestjs/common';
import { PricingService } from './pricing.service.js';
import { PricingController } from './pricing.controller.js';

/** Global so trips and matching can price without import cycles. */
@Global()
@Module({
  controllers: [PricingController],
  providers: [PricingService],
  exports: [PricingService],
})
export class PricingModule {}
