import { Global, Module } from '@nestjs/common';
import { FleetService } from './fleet.service.js';
import { FleetController } from './fleet.controller.js';

@Global()
@Module({
  controllers: [FleetController],
  providers: [FleetService],
  exports: [FleetService],
})
export class FleetModule {}
