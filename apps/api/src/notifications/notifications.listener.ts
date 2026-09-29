import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { REDIS_CHANNEL, type RealtimeEvent } from '../realtime/realtime.events.js';
import { NotificationsService } from './notifications.service.js';

const NEARBY_DRIVER_RADIUS_M = 5000;
const vnd = (n: unknown) => `${Number(n).toLocaleString('vi-VN')} đ`;

/**
 * Turns domain events (already flowing through Redis for the sockets) into
 * push notifications. Runs on every API instance; a short-lived Redis
 * SETNX key makes sure each event is handled exactly once.
 */
@Injectable()
export class NotificationsListener implements OnModuleInit {
  private readonly logger = new Logger(NotificationsListener.name);

  constructor(
    private redis: RedisService,
    private prisma: PrismaService,
    private notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    await this.redis.subscribe(REDIS_CHANNEL, (event: RealtimeEvent) => {
      this.handle(event).catch((err) => this.logger.warn(`notification failed: ${(err as Error).message}`));
    });
  }

  private async claim(event: RealtimeEvent) {
    const key = `notif:dedupe:${createHash('sha1').update(JSON.stringify(event)).digest('hex')}`;
    const ok = await this.redis.client.set(key, '1', 'EX', 30, 'NX');
    return ok === 'OK';
  }

  private async handle(event: RealtimeEvent) {
    if (event.type === 'driver.location' || event.type === 'notification') return;
    if (!(await this.claim(event))) return;

    switch (event.type) {
      case 'trip.updated':
        return this.onTripUpdated(event);
      case 'trip.created':
        return this.onTripCreated(event.trip);
      case 'group.created':
        return this.onGroupCreated(event.groupId);
      default:
        return;
    }
  }

  private async onTripUpdated(e: Extract<RealtimeEvent, { type: 'trip.updated' }>) {
    const trip = await this.prisma.trip.findUnique({
      where: { id: e.tripId },
      include: { driver: { include: { user: { select: { fullName: true } } } }, vehicle: true, customer: { select: { fullName: true } } },
    });
    if (!trip) return;
    const data = { screen: 'trip', tripId: trip.id, groupId: trip.groupId, status: e.status };
    const route = `${trip.pickupAddress} → ${trip.dropoffAddress}`;
    const driverName = trip.driver?.user.fullName ?? 'Tài xế';
    const plate = trip.vehicle?.plateNumber ? ` (${trip.vehicle.plateNumber})` : '';

    switch (e.status) {
      case 'ACCEPTED':
        await this.notifications.sendToUser(e.customerId, {
          title: 'Tài xế đã nhận chuyến',
          body: `${driverName}${plate} sẽ đón bạn tại ${trip.pickupAddress}`,
          data,
        });
        if (e.reason === 'rider_joined' && e.driverUserId) {
          await this.notifications.sendToUser(e.driverUserId, {
            title: 'Có khách mới ghép vào chuyến',
            body: `${trip.customer.fullName}: đón tại ${trip.pickupAddress}`,
            data: { ...data, screen: 'group' },
          });
        }
        return;
      case 'EN_ROUTE_TO_PICKUP':
        return this.notifications.sendToUser(e.customerId, { title: 'Tài xế đang tới đón bạn', body: `${driverName}${plate} đang trên đường tới ${trip.pickupAddress}`, data });
      case 'IN_PROGRESS':
        return this.notifications.sendToUser(e.customerId, { title: 'Chuyến đi bắt đầu', body: route, data });
      case 'COMPLETED':
        return this.notifications.sendToUser(e.customerId, {
          title: 'Chuyến đi hoàn thành',
          body: `${route} · ${vnd(trip.fare)} (${trip.paymentMethod === 'WALLET' ? 'đã trừ ví' : 'tiền mặt'}). Hãy đánh giá tài xế!`,
          data,
        });
      case 'CANCELLED':
        if (e.reason === 'customer_cancelled' && e.driverUserId) {
          return this.notifications.sendToUser(e.driverUserId, { title: 'Khách đã huỷ chuyến', body: route, data });
        }
        if (e.reason === 'driver_cancelled') {
          return this.notifications.sendToUser(e.customerId, { title: 'Tài xế đã huỷ chuyến', body: `${route}. Bạn có thể đặt lại chuyến mới.`, data });
        }
        return;
      default:
        return;
    }
  }

  /** New private trip → available drivers within 5 km of the pickup (transient, not stored). */
  private async onTripCreated(trip: Extract<RealtimeEvent, { type: 'trip.created' }>['trip']) {
    const zone = await this.prisma.trip.findUnique({ where: { id: trip.id }, select: { pickupZoneId: true } });
    const userIds = await this.nearbyDriverUserIds(trip.pickupLat, trip.pickupLng, zone?.pickupZoneId ?? null);
    if (userIds.length === 0) return;
    await this.notifications.sendToUsers(userIds, {
      title: 'Chuyến mới gần bạn',
      body: `${trip.pickupAddress} → ${trip.dropoffAddress} · ${vnd(trip.fare)}`,
      data: { screen: 'home', tripId: trip.id },
      transient: true,
    });
  }

  private async onGroupCreated(groupId: string) {
    const first = await this.prisma.tripStop.findFirst({ where: { groupId, sequence: 0 }, include: { group: { select: { zoneId: true } } } });
    if (!first) return;
    const userIds = await this.nearbyDriverUserIds(first.lat, first.lng, first.group.zoneId);
    if (userIds.length === 0) return;
    await this.notifications.sendToUsers(userIds, {
      title: 'Nhóm xe ghép mới gần bạn',
      body: `Đón đầu tiên tại ${first.address}`,
      data: { screen: 'home', groupId },
      transient: true,
    });
  }

  private async nearbyDriverUserIds(lat: number, lng: number, zoneId: string | null) {
    const hits = (await this.redis.nearbyDrivers(lat, lng, NEARBY_DRIVER_RADIUS_M, 50)).filter((h) => !h.stale);
    if (hits.length === 0) return [];
    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: hits.map((h) => h.driverId) },
        status: 'AVAILABLE',
        // drivers bound to a zone only get work from that zone; unassigned drivers get everything
        OR: [{ zoneId: null }, ...(zoneId ? [{ zoneId }] : [])],
      },
      select: { userId: true },
    });
    return drivers.map((d) => d.userId);
  }
}
