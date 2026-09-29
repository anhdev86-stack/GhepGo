import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { PrismaService } from './prisma/prisma.service.js';
import { RedisService } from './redis/redis.service.js';

describe('AppController', () => {
  let appController: AppController;
  const prisma = { $queryRaw: vi.fn().mockResolvedValue([{ '?column?': 1 }]) };
  const redis = { client: { ping: vi.fn().mockResolvedValue('PONG') } };

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService, { provide: PrismaService, useValue: prisma }, { provide: RedisService, useValue: redis }],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  it('should return "Hello World!"', () => {
    expect(appController.getHello()).toBe('Hello World!');
  });

  it('reports healthy when db and redis answer', async () => {
    const h = await appController.health();
    expect(h.status).toBe('ok');
    expect(h.db).toBe(true);
    expect(h.redis).toBe(true);
  });

  it('reports degraded when redis is down', async () => {
    redis.client.ping.mockRejectedValueOnce(new Error('down'));
    const h = await appController.health();
    expect(h.status).toBe('degraded');
    expect(h.redis).toBe(false);
  });
});
