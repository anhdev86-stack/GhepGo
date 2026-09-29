import { Module } from '@nestjs/common';
import { DispatchService } from './dispatch.service.js';
import { DispatchController } from './dispatch.controller.js';
import { MatchingModule } from '../matching/matching.module.js';

@Module({
  imports: [MatchingModule],
  controllers: [DispatchController],
  providers: [DispatchService],
  exports: [DispatchService],
})
export class DispatchModule {}
