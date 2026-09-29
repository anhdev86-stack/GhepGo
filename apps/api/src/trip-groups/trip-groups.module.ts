import { Module } from '@nestjs/common';
import { TripGroupsService } from './trip-groups.service.js';
import { TripGroupsController } from './trip-groups.controller.js';

@Module({
  controllers: [TripGroupsController],
  providers: [TripGroupsService],
})
export class TripGroupsModule {}
