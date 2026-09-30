import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import { RealtimePublisher } from '../realtime/realtime.publisher.js';
import { FleetService } from '../fleet/fleet.service.js';
import { ZonesService } from '../zones/zones.service.js';
import { UpdateDriverStatusDto } from './dto/update-status.dto.js';
import { UpdateDriverLocationDto } from './dto/update-location.dto.js';

/** How often (ms) a driver's position is also persisted to PostgreSQL. */
const DB_LOCATION_WRITE_INTERVAL_MS = 30_000;

@Injectable()
export class DriversService {
  private lastDbWrite = new Map<string, number>();

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private publisher: RealtimePublisher,
    private fleet: FleetService,
    private zones: ZonesService,
  ) {}

  async findByUserId(userId: string) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      include: { user: true, vehicles: true },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    return driver;
  }

  async updateStatus(userId: string, dto: UpdateDriverStatusDto) {
    const driver = await this.findByUserId(userId);
    if (driver.status === 'ON_TRIP') {
      throw new BadRequestException('Không thể đổi trạng thái khi đang chạy chuyến');
    }
    if (dto.status === 'OFFLINE') {
      await this.redis.removeDriverLocation(driver.id);
      await this.fleet.endShift(driver.id);
    } else {
      await this.fleet.startShift(driver.id);
    }
    return this.prisma.driver.update({
      where: { id: driver.id },
      data: { status: dto.status },
    });
  }

  /** HTTP fallback for clients without a socket; same path as the gateway. */
  async updateLocation(userId: string, dto: UpdateDriverLocationDto) {
    await this.recordLocation(userId, dto);
    return { ok: true };
  }

  /**
   * Hot path for GPS updates:
   *  1. write to Redis (GEO + hash with TTL)
   *  2. publish to riders of the driver's active trips/groups via Redis pub/sub
   *  3. persist to PostgreSQL at most every 30s (coarse copy for admin/reporting)
   */
  async recordLocation(
    userId: string,
    loc: { lat: number; lng: number; heading?: number; speed?: number },
  ) {
    const driver = await this.prisma.driver.findUnique({
      where: { userId },
      select: {
        id: true,
        trips: {
          where: { status: { in: ['ACCEPTED', 'EN_ROUTE_TO_PICKUP', 'IN_PROGRESS'] } },
          select: { id: true, groupId: true },
        },
      },
    });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');

    const updatedAt = Date.now();
    await this.redis.setDriverLocation({ driverId: driver.id, ...loc, updatedAt });

    const tripIds = driver.trips.map((t) => t.id);
    const groupIds = [...new Set(driver.trips.map((t) => t.groupId).filter((g): g is string => !!g))];
    this.publisher.publish({
      type: 'driver.location',
      driverId: driver.id,
      lat: loc.lat,
      lng: loc.lng,
      heading: loc.heading,
      speed: loc.speed,
      updatedAt,
      tripIds,
      groupIds,
    });

    const last = this.lastDbWrite.get(driver.id) ?? 0;
    if (updatedAt - last > DB_LOCATION_WRITE_INTERVAL_MS) {
      this.lastDbWrite.set(driver.id, updatedAt);
      await this.prisma.driver.update({
        where: { id: driver.id },
        data: { currentLat: loc.lat, currentLng: loc.lng },
      });
    }
  }

  async getLocation(driverId: string) {
    return this.redis.getDriverLocation(driverId);
  }

  async findNearby(lat: number, lng: number, radiusMeters = 5000) {
    const hits = await this.redis.nearbyDrivers(lat, lng, radiusMeters);
    const live = hits.filter((h) => !h.stale);
    if (live.length === 0) return [];
    const zone = await this.zones.resolve(lat, lng);
    const drivers = await this.prisma.driver.findMany({
      where: {
        id: { in: live.map((h) => h.driverId) },
        status: 'AVAILABLE',
        OR: [{ zoneId: null }, ...(zone ? [{ zoneId: zone.id }] : [])],
      },
      include: { user: { select: { fullName: true } }, vehicles: { where: { isActive: true }, take: 1 } },
    });
    const byId = new Map(drivers.map((d) => [d.id, d]));
    return live
      .filter((h) => byId.has(h.driverId))
      .map((h) => {
        const d = byId.get(h.driverId)!;
        return {
          driverId: d.id,
          fullName: d.user.fullName,
          vehicle: d.vehicles[0] ?? null,
          ratingAvg: d.ratingAvg,
          lat: h.lat,
          lng: h.lng,
          distanceMeters: h.distanceMeters,
        };
      });
  }

  async findAll() {
    const drivers = await this.prisma.driver.findMany({
      include: { user: true, vehicles: true, zone: { select: { id: true, name: true } } },
    });
    // Overlay live Redis position when available.
    return Promise.all(
      drivers.map(async (d) => {
        const live = await this.redis.getDriverLocation(d.id);
        return live ? { ...d, currentLat: live.lat, currentLng: live.lng, locationUpdatedAt: live.updatedAt } : d;
      }),
    );
  }

  async findAvailable() {
    return this.prisma.driver.findMany({
      where: { status: 'AVAILABLE' },
      include: { user: true, vehicles: true },
    });
  }
}
