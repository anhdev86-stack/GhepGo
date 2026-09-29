import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { MatchingService } from '../matching/matching.service.js';

/**
 * Dispatch housekeeping:
 *  - expireStale(): trips nobody accepted within TRIP_REQUEST_TTL_MIN are
 *    cancelled and the customer is told; shared groups still MATCHING after
 *    GROUP_MATCHING_TTL_MIN are cancelled with all their trips.
 *  - suggestDrivers(): ranked drivers for a pickup point (distance, rating,
 *    zone) — used by the customer app to show "tài xế gần nhất" and by the
 *    admin to hand-assign.
 *  - offer(): admin/system offers a trip to one driver (push + socket) and
 *    records the offer so it can be reported on.
 *
 * Runs on every instance; Redis SETNX makes each tick single-runner.
 */
@Injectable()
export class DispatchService {
  private readonly logger = new Logger(DispatchService.name);
  readonly requestTtlMin: number;
  readonly groupTtlMin: number;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private publisher: RealtimePublisher,
    private notifications: NotificationsService,
    private matching: MatchingService,
    config: ConfigService,
  ) {
    this.requestTtlMin = Number(config.get('TRIP_REQUEST_TTL_MIN') ?? 10);
    this.groupTtlMin = Number(config.get('GROUP_MATCHING_TTL_MIN') ?? 20);
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async tick() {
    const lock = await this.redis.client.set('dispatch:tick', '1', 'EX', 50, 'NX');
    if (lock !== 'OK') return;
    try {
      await this.expireStale();
    } catch (err) {
      this.logger.error(`expireStale failed: ${(err as Error).message}`);
    }
  }

  async expireStale(now = new Date()) {
    const tripCutoff = new Date(now.getTime() - this.requestTtlMin * 60_000);
    const stale = await this.prisma.trip.findMany({
      where: { status: 'REQUESTED', driverId: null, requestedAt: { lt: tripCutoff } },
      select: { id: true, customerId: true, pickupAddress: true, dropoffAddress: true },
    });
    for (const t of stale) {
      const r = await this.prisma.trip.updateMany({
        where: { id: t.id, status: 'REQUESTED', driverId: null },
        data: { status: 'CANCELLED', cancelledAt: now },
      });
      if (r.count !== 1) continue;
      this.publisher.publish({ type: 'trip.updated', tripId: t.id, customerId: t.customerId, status: 'CANCELLED', reason: 'expired' });
      await this.notifications.sendToUser(t.customerId, {
        title: 'Chưa tìm được tài xế',
        body: `${t.pickupAddress} → ${t.dropoffAddress}: không có tài xế nhận trong ${this.requestTtlMin} phút. Bạn có thể đặt lại.`,
        data: { screen: 'trip', tripId: t.id },
      });
    }

    const groupCutoff = new Date(now.getTime() - this.groupTtlMin * 60_000);
    const groups = await this.prisma.tripGroup.findMany({
      where: { status: 'MATCHING', driverId: null, createdAt: { lt: groupCutoff } },
      include: { trips: { where: { status: { notIn: ['CANCELLED'] } }, select: { id: true, customerId: true, pickupAddress: true, dropoffAddress: true } } },
    });
    for (const g of groups) {
      const r = await this.prisma.tripGroup.updateMany({ where: { id: g.id, status: 'MATCHING', driverId: null }, data: { status: 'CANCELLED' } });
      if (r.count !== 1) continue;
      await this.prisma.trip.updateMany({ where: { groupId: g.id, status: { notIn: ['CANCELLED'] } }, data: { status: 'CANCELLED', cancelledAt: now } });
      for (const t of g.trips) {
        this.publisher.publish({ type: 'trip.updated', tripId: t.id, customerId: t.customerId, status: 'CANCELLED', groupId: g.id, reason: 'expired' });
        await this.notifications.sendToUser(t.customerId, {
          title: 'Chưa tìm được tài xế cho xe ghép',
          body: `${t.pickupAddress} → ${t.dropoffAddress}: nhóm chờ quá ${this.groupTtlMin} phút. Bạn có thể đặt lại hoặc chọn bao xe.`,
          data: { screen: 'trip', tripId: t.id },
        });
      }
      await this.matching.notifyGroupChanged(g.id);
    }
    if (stale.length || groups.length) this.logger.log(`expired ${stale.length} trips, ${groups.length} groups`);
    return { trips: stale.length, groups: groups.length };
  }

  /** Ranked available drivers for a pickup: closer first, then rating; zone rules applied. */
  async suggestDrivers(lat: number, lng: number, zoneId: string | null, radiusMeters = 7000, limit = 5) {
    const hits = (await this.redis.nearbyDrivers(lat, lng, radiusMeters, 50)).filter((h) => !h.stale);
    if (hits.length === 0) return [];
    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: hits.map((h) => h.driverId) },
        status: 'AVAILABLE',
        OR: [{ zoneId: null }, ...(zoneId ? [{ zoneId }] : [])],
        vehicles: { some: { isActive: true } },
      },
      include: { user: { select: { id: true, fullName: true } }, vehicles: { where: { isActive: true }, take: 1 } },
    });
    const dist = new Map(hits.map((h) => [h.driverId, h]));
    return drivers
      .map((d) => {
        const h = dist.get(d.id)!;
        // ETA at ~30 km/h city speed
        const etaSecs = Math.round((h.distanceMeters * 1.3) / 8.3);
        return {
          driverId: d.id,
          userId: d.user.id,
          fullName: d.user.fullName,
          ratingAvg: d.ratingAvg,
          vehicle: d.vehicles[0] ? `${d.vehicles[0].make} ${d.vehicles[0].model} · ${d.vehicles[0].plateNumber}` : null,
          distanceMeters: h.distanceMeters,
          etaSecs,
          // score: distance dominates, rating breaks ties (5★ ≈ 500 m advantage)
          score: h.distanceMeters - (d.ratingAvg - 4) * 500,
        };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, limit);
  }

  /** Offer a REQUESTED trip to a specific driver (push + socket). Does not assign. */
  async offer(tripId: string, driverId: string) {
    const [trip, driver] = await Promise.all([
      this.prisma.trip.findUnique({ where: { id: tripId } }),
      this.prisma.driver.findUnique({ where: { id: driverId }, select: { userId: true, status: true } }),
    ]);
    if (!trip || trip.status !== 'REQUESTED' || trip.driverId) return { ok: false, reason: 'trip_unavailable' };
    if (!driver || driver.status !== 'AVAILABLE') return { ok: false, reason: 'driver_unavailable' };
    await this.redis.client.set(`offer:${tripId}:${driverId}`, '1', 'EX', 120);
    await this.notifications.sendToUser(driver.userId, {
      title: 'Đề nghị chuyến đi',
      body: `${trip.pickupAddress} → ${trip.dropoffAddress} · ${Number(trip.fare).toLocaleString('vi-VN')} đ. Mở app để nhận.`,
      data: { screen: 'home', tripId },
      transient: true,
    });
    return { ok: true };
  }
}
