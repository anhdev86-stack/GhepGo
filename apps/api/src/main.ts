import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module.js';
import { StripSensitiveInterceptor } from './common/strip-sensitive.interceptor.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalInterceptors(new StripSensitiveInterceptor());
  app.setGlobalPrefix('api');
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
