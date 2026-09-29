import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { AuthModule } from './auth/auth.module.js';
import { DriversModule } from './drivers/drivers.module.js';
import { VehiclesModule } from './vehicles/vehicles.module.js';
import { TripsModule } from './trips/trips.module.js';
import { TripGroupsModule } from './trip-groups/trip-groups.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    AuthModule,
    DriversModule,
    VehiclesModule,
    TripsModule,
    TripGroupsModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
