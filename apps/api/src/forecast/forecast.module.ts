import { Module } from '@nestjs/common';
import { ForecastService } from './forecast.service.js';
import { ForecastController } from './forecast.controller.js';

@Module({
  controllers: [ForecastController],
  providers: [ForecastService],
  exports: [ForecastService],
})
export class ForecastModule {}
