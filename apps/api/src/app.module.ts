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
import { RedisModule } from './redis/redis.module.js';
import { RealtimeModule } from './realtime/realtime.module.js';
import { GeoModule } from './geo/geo.module.js';
import { WalletModule } from './wallet/wallet.module.js';
import { FleetModule } from './fleet/fleet.module.js';
import { SmsModule } from './sms/sms.module.js';
import { NotificationsModule } from './notifications/notifications.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PrismaModule,
    RedisModule,
    SmsModule,
    NotificationsModule,
    RealtimeModule,
    GeoModule,
    WalletModule,
    FleetModule,
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
