import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerModule } from '@nestjs/throttler';
import { AppThrottlerGuard } from './common/app-throttler.guard.js';
import { ScheduleModule } from '@nestjs/schedule';
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
import { ComplaintsModule } from './complaints/complaints.module.js';
import { ZonesModule } from './zones/zones.module.js';
import { DispatchModule } from './dispatch/dispatch.module.js';
import { ForecastModule } from './forecast/forecast.module.js';
import { PricingModule } from './pricing/pricing.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Global rate limit per IP; auth endpoints declare stricter limits.
    ThrottlerModule.forRoot([{ name: 'default', ttl: 60_000, limit: Number(process.env.RATE_LIMIT_PER_MINUTE ?? 300) }]),
    ScheduleModule.forRoot(),
    PrismaModule,
    RedisModule,
    ZonesModule,
    SmsModule,
    NotificationsModule,
    RealtimeModule,
    GeoModule,
    WalletModule,
    PricingModule,
    FleetModule,
    AuthModule,
    DriversModule,
    VehiclesModule,
    TripsModule,
    TripGroupsModule,
    ComplaintsModule,
    DispatchModule,
    ForecastModule,
  ],
  controllers: [AppController],
  providers: [AppService, { provide: APP_GUARD, useClass: AppThrottlerGuard }],
})
export class AppModule {}
