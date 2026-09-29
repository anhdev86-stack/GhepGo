import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private prisma: PrismaService,
    private redis: RedisService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /** Liveness + dependency check for load balancers and docker healthchecks. */
  @Get('health')
  async health() {
    const [db, redis] = await Promise.allSettled([this.prisma.$queryRaw`SELECT 1`, this.redis.client.ping()]);
    const ok = db.status === 'fulfilled' && redis.status === 'fulfilled';
    return { status: ok ? 'ok' : 'degraded', db: db.status === 'fulfilled', redis: redis.status === 'fulfilled', time: new Date().toISOString() };
  }
}
