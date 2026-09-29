import { Module } from '@nestjs/common';
import { ComplaintsService } from './complaints.service.js';
import { ComplaintsController } from './complaints.controller.js';

@Module({
  controllers: [ComplaintsController],
  providers: [ComplaintsService],
})
export class ComplaintsModule {}
