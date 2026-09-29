import { Global, Module } from '@nestjs/common';
import { ZonesService } from './zones.service.js';

@Global()
@Module({
  providers: [ZonesService],
  exports: [ZonesService],
})
export class ZonesModule {}
