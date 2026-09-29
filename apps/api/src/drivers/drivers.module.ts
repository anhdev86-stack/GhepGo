import { Module } from '@nestjs/common';
import { DriversService } from './drivers.service.js';
import { DriversController } from './drivers.controller.js';

@Module({
  controllers: [DriversController],
  providers: [DriversService],
  exports: [DriversService],
})
export class DriversModule {}
