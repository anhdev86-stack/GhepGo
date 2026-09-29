import { Global, Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { RealtimeGateway } from './realtime.gateway.js';
import { RealtimePublisher } from './realtime.publisher.js';
import { DriversModule } from '../drivers/drivers.module.js';

@Global()
@Module({
  imports: [
    DriversModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
      }),
    }),
  ],
  providers: [RealtimeGateway, RealtimePublisher],
  exports: [RealtimePublisher],
})
export class RealtimeModule {}
