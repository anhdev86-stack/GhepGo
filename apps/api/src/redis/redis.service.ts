import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';

export const DRIVER_GEO_KEY = 'drivers:geo';
export const DRIVER_LOCATION_TTL_SECS = 120;

export interface DriverLocation {
  driverId: string;
  lat: number;
  lng: number;
  heading?: number;
  speed?: number;
  updatedAt: number;
}

/**
 * Thin wrapper around ioredis exposing:
 *  - a general-purpose client (GEO, key/value)
 *  - a dedicated publisher and subscriber pair for pub/sub fan-out
 *
 * Driver positions live only in Redis (GEO set + per-driver hash with TTL);
 * PostgreSQL keeps a coarse copy for reporting but is never polled for
 * realtime tracking.
 */
@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);
  readonly client: Redis;
  readonly publisher: Redis;
  readonly subscriber: Redis;

  constructor(config: ConfigService) {
    const url = config.get<string>('REDIS_URL') ?? 'redis://localhost:6379';
    const options = { lazyConnect: false, maxRetriesPerRequest: 3 };
    this.client = new Redis(url, options);
    this.publisher = new Redis(url, options);
    this.subscriber = new Redis(url, options);
    for (const conn of [this.client, this.publisher, this.subscriber]) {
      conn.on('error', (err) => this.logger.warn(`Redis error: ${err.message}`));
    }
  }

  async onModuleDestroy() {
    await Promise.allSettled([this.client.quit(), this.publisher.quit(), this.subscriber.quit()]);
  }

  async publish(channel: string, payload: unknown) {
    await this.publisher.publish(channel, JSON.stringify(payload));
  }

  async subscribe(channel: string, handler: (payload: any) => void) {
    await this.subscriber.subscribe(channel);
    this.subscriber.on('message', (ch, message) => {
      if (ch !== channel) return;
      try {
        handler(JSON.parse(message));
      } catch (err) {
        this.logger.warn(`Bad message on ${channel}: ${(err as Error).message}`);
      }
    });
  }

  // -------- Driver location (GEO) --------

  async setDriverLocation(loc: DriverLocation) {
    const key = `driver:${loc.driverId}:loc`;
    await this.client
      .multi()
      .geoadd(DRIVER_GEO_KEY, loc.lng, loc.lat, loc.driverId)
      .hset(key, {
        lat: loc.lat,
        lng: loc.lng,
        heading: loc.heading ?? '',
        speed: loc.speed ?? '',
        updatedAt: loc.updatedAt,
      })
      .expire(key, DRIVER_LOCATION_TTL_SECS)
      .exec();
  }

  async getDriverLocation(driverId: string): Promise<DriverLocation | null> {
    const data = await this.client.hgetall(`driver:${driverId}:loc`);
    if (!data || !data.lat) return null;
    return {
      driverId,
      lat: Number(data.lat),
      lng: Number(data.lng),
      heading: data.heading ? Number(data.heading) : undefined,
      speed: data.speed ? Number(data.speed) : undefined,
      updatedAt: Number(data.updatedAt),
    };
  }

  async removeDriverLocation(driverId: string) {
    await this.client.multi().zrem(DRIVER_GEO_KEY, driverId).del(`driver:${driverId}:loc`).exec();
  }

  /** Nearest drivers within radius (meters), sorted ascending by distance. */
  async nearbyDrivers(lat: number, lng: number, radiusMeters: number, limit = 20) {
    const raw = (await this.client.geosearch(
      DRIVER_GEO_KEY,
      'FROMLONLAT',
      lng,
      lat,
      'BYRADIUS',
      radiusMeters,
      'm',
      'ASC',
      'COUNT',
      limit,
      'WITHDIST',
      'WITHCOORD',
    )) as [string, string, [string, string]][];

    const results: { driverId: string; distanceMeters: number; lat: number; lng: number; stale: boolean }[] = [];
    for (const [driverId, dist, [lon, la]] of raw) {
      // GEO set has no TTL; treat drivers whose hash expired as stale.
      const alive = await this.client.exists(`driver:${driverId}:loc`);
      results.push({
        driverId,
        distanceMeters: Math.round(Number(dist)),
        lat: Number(la),
        lng: Number(lon),
        stale: alive === 0,
      });
    }
    return results;
  }
}
