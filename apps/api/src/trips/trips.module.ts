import { Module } from '@nestjs/common';
import { TripsService } from './trips.service.js';
import { TripsController } from './trips.controller.js';
import { MatchingModule } from '../matching/matching.module.js';

@Module({
  imports: [MatchingModule],
  controllers: [TripsController],
  providers: [TripsService],
})
export class TripsModule {}
