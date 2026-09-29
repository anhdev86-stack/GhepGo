import { Injectable } from '@nestjs/common';
import { RedisService } from '../redis/redis.service.js';
import { REDIS_CHANNEL, type RealtimeEvent } from './realtime.events.js';

/**
 * Domain services publish events here; the gateway (possibly on another
 * instance) subscribes and fans out to sockets. Going through Redis keeps
 * the API horizontally scalable.
 */
@Injectable()
export class RealtimePublisher {
  constructor(private redis: RedisService) {}

  publish(event: RealtimeEvent) {
    // Fire-and-forget: a failed publish must never fail the HTTP request.
    void this.redis.publish(REDIS_CHANNEL, event).catch(() => undefined);
  }
}
