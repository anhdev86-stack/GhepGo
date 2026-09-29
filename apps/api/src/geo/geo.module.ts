import { Global, Module } from '@nestjs/common';
import { GeoService } from './geo.service.js';
import { GeoController } from './geo.controller.js';

@Global()
@Module({
  controllers: [GeoController],
  providers: [GeoService],
  exports: [GeoService],
})
export class GeoModule {}
