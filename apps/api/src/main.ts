import { NestFactory } from '@nestjs/core';
import { Logger, ValidationPipe } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { AppModule } from './app.module.js';
import { StripSensitiveInterceptor } from './common/strip-sensitive.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  // Behind a reverse proxy / load balancer the client IP comes from X-Forwarded-For.
  app.set('trust proxy', process.env.TRUST_PROXY ?? (isProd ? 1 : 0));
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  // CORS: explicit allow-list in production, permissive in development.
  const origins = (process.env.CORS_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (isProd && origins.length === 0) {
    Logger.warn('CORS_ORIGINS is empty in production — browsers will be blocked', 'Bootstrap');
  }
  app.enableCors({ origin: isProd ? origins : true, credentials: true });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new StripSensitiveInterceptor());
  app.setGlobalPrefix('api');
  app.enableShutdownHooks();
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
