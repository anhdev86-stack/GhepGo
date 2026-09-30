import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { RedisService } from '../redis/redis.service.js';
import {
  CELL_DEG,
  cellOf,
  confidenceFor,
  HOURS_PER_WEEK,
  nextHours,
  shiftHoursBySlot,
  SLOT_LABEL_DOW,
  slotIndex,
  slotOf,
  weightedMean,
} from './forecast.util.js';

const PROFILE_CACHE_SECS = 300;
/** Trips a driver typically completes per online hour when we have no history yet. */
const DEFAULT_TRIPS_PER_DRIVER_HOUR = 1.2;
const MAX_WEEKS = 12;

interface SlotRow {
  dow: number;
  hour: number;
  weekAgo: number;
  requests: number;
}
interface CellRow {
  dow: number;
  hour: number;
  weekAgo: number;
  cellLat: number;
  cellLng: number;
  requests: number;
}

export interface SlotForecast {
  at: string;
  dow: number;
  hour: number;
  label: string;
  demand: number;
  supplyDrivers: number;
  capacity: number;
  gap: number;
}

/**
 * Demand forecasting by hour-of-week and pickup cell.
 *
 *  - `profile()` — 7 × 24 expected ride requests and online drivers per slot
 *    (exponentially weighted over the last N weeks), optionally per zone.
 *  - `forecast()` — the next H hours: demand, expected supply, capacity
 *    (drivers × trips-per-driver-hour) and the gap admins should staff for.
 *  - `hotspots()` — pickup cells with the most expected requests for a
 *    time slot, with live driver counts so idle drivers can be sent there.
 *
 * Reads only `trips` and `driver_shifts`; results are cached in Redis for
 * five minutes. FORECAST_TZ (default Asia/Ho_Chi_Minh) defines the slots.
 */
@Injectable()
export class ForecastService {
  private readonly logger = new Logger(ForecastService.name);
  readonly timeZone: string;

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.timeZone = config.get<string>('FORECAST_TZ') ?? 'Asia/Ho_Chi_Minh';
  }

  private async cached<T>(key: string, compute: () => Promise<T>): Promise<T> {
    const hit = await this.redis.client.get(key).catch(() => null);
    if (hit) return JSON.parse(hit) as T;
    const value = await compute();
    await this.redis.client.set(key, JSON.stringify(value), 'EX', PROFILE_CACHE_SECS).catch(() => undefined);
    return value;
  }

  private zoneFilter(zoneId: string | null) {
    return zoneId ? Prisma.sql`AND "pickupZoneId" = ${zoneId}` : Prisma.empty;
  }

  /** Requests per (dow, hour, week-ago) over the window, in the forecast time zone. */
  private async demandRows(zoneId: string | null, weeks: number, now: Date): Promise<SlotRow[]> {
    const since = new Date(now.getTime() - weeks * 7 * 86400_000);
    const rows = await this.prisma.$queryRaw<{ dow: number; hour: number; weekago: number; requests: bigint }[]>`
      SELECT EXTRACT(DOW FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int AS dow,
             EXTRACT(HOUR FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int AS hour,
             GREATEST(1, CEIL(EXTRACT(EPOCH FROM (${now}::timestamptz - "requestedAt")) / 604800))::int AS weekago,
             COUNT(*) AS requests
      FROM trips
      WHERE "requestedAt" >= ${since} AND "requestedAt" < ${now} ${this.zoneFilter(zoneId)}
      GROUP BY 1, 2, 3`;
    return rows.map((r) => ({ dow: r.dow, hour: r.hour, weekAgo: r.weekago, requests: Number(r.requests) }));
  }

  /** Online driver-hours per slot, averaged per week, from shifts overlapping the window. */
  private async supplyProfile(zoneId: string | null, weeks: number, now: Date): Promise<Float64Array> {
    const since = new Date(now.getTime() - weeks * 7 * 86400_000);
    const shifts = await this.prisma.driverShift.findMany({
      where: {
        startedAt: { lt: now },
        OR: [{ endedAt: null }, { endedAt: { gt: since } }],
        ...(zoneId ? { driver: { zoneId } } : {}),
      },
      select: { startedAt: true, endedAt: true },
    });
    const total = new Float64Array(HOURS_PER_WEEK);
    for (const s of shifts) {
      const start = s.startedAt < since ? since : s.startedAt;
      const end = s.endedAt ?? now;
      if (end <= start) continue;
      shiftHoursBySlot(start, end > now ? now : end, this.timeZone, total);
    }
    for (let i = 0; i < total.length; i++) total[i] /= weeks;
    return total;
  }

  /** Completed trips per driver-hour in the window — the conversion from supply to capacity. */
  private async tripsPerDriverHour(zoneId: string | null, weeks: number, now: Date): Promise<number> {
    const since = new Date(now.getTime() - weeks * 7 * 86400_000);
    const [completed, shifts] = await Promise.all([
      this.prisma.trip.count({ where: { status: 'COMPLETED', completedAt: { gte: since, lt: now }, ...(zoneId ? { pickupZoneId: zoneId } : {}) } }),
      this.prisma.driverShift.findMany({
        where: { startedAt: { gte: since, lt: now }, ...(zoneId ? { driver: { zoneId } } : {}) },
        select: { startedAt: true, endedAt: true },
      }),
    ]);
    const hours = shifts.reduce((sum, s) => sum + Math.min(24, ((s.endedAt ?? now).getTime() - s.startedAt.getTime()) / 3600_000), 0);
    if (hours < 10 || completed < 10) return DEFAULT_TRIPS_PER_DRIVER_HOUR;
    return Math.max(0.2, Math.min(4, completed / hours));
  }

  /** 7 × 24 demand and supply profile. */
  async profile(zoneId: string | null = null, weeks = 8, now = new Date()) {
    weeks = Math.max(1, Math.min(MAX_WEEKS, Math.round(weeks)));
    return this.cached(`forecast:profile:${zoneId ?? 'all'}:${weeks}:${now.toISOString().slice(0, 13)}`, async () => {
      const [rows, supply, tpdh] = await Promise.all([this.demandRows(zoneId, weeks, now), this.supplyProfile(zoneId, weeks, now), this.tripsPerDriverHour(zoneId, weeks, now)]);
      const perSlot = new Map<number, Map<number, number>>();
      const weeksSeen = new Set<number>();
      let totalRequests = 0;
      for (const r of rows) {
        const idx = r.dow * 24 + r.hour;
        if (!perSlot.has(idx)) perSlot.set(idx, new Map());
        perSlot.get(idx)!.set(r.weekAgo, r.requests);
        weeksSeen.add(r.weekAgo);
        totalRequests += r.requests;
      }
      const demand = Array.from({ length: HOURS_PER_WEEK }, (_, idx) => Math.round(weightedMean(perSlot.get(idx) ?? new Map(), weeks) * 100) / 100);
      const supplyArr = Array.from(supply, (h) => Math.round(h * 100) / 100);
      return {
        timeZone: this.timeZone,
        weeks,
        sampleWeeks: weeksSeen.size,
        confidence: confidenceFor(weeksSeen.size),
        totalRequests,
        tripsPerDriverHour: Math.round(tpdh * 100) / 100,
        dowLabels: SLOT_LABEL_DOW,
        /** demand[dow*24+hour]: expected requests in that hour of the week. */
        demand,
        /** supply[dow*24+hour]: average online drivers in that hour of the week. */
        supply: supplyArr,
        peak: demand.reduce((best, v, idx) => (v > best.value ? { idx, value: v } : best), { idx: 0, value: 0 }),
      };
    });
  }

  /** Next `horizon` hours with expected demand, supply, capacity and gap. */
  async forecast(zoneId: string | null = null, horizon = 24, weeks = 8, now = new Date()) {
    horizon = Math.max(1, Math.min(168, Math.round(horizon)));
    const p = await this.profile(zoneId, weeks, now);
    const hours = nextHours(now, horizon).map<SlotForecast>((at) => {
      const s = slotOf(at, this.timeZone);
      const idx = slotIndex(s);
      const demand = p.demand[idx];
      const supplyDrivers = p.supply[idx];
      const capacity = Math.round(supplyDrivers * p.tripsPerDriverHour * 100) / 100;
      return {
        at: at.toISOString(),
        dow: s.dow,
        hour: s.hour,
        label: `${SLOT_LABEL_DOW[s.dow]} ${String(s.hour).padStart(2, '0')}h`,
        demand,
        supplyDrivers,
        capacity,
        gap: Math.round((demand - capacity) * 100) / 100,
      };
    });
    const under = hours.filter((h) => h.gap > 0);
    return {
      zoneId,
      generatedAt: now.toISOString(),
      timeZone: p.timeZone,
      confidence: p.confidence,
      sampleWeeks: p.sampleWeeks,
      tripsPerDriverHour: p.tripsPerDriverHour,
      hours,
      summary: {
        expectedRequests: Math.round(hours.reduce((s, h) => s + h.demand, 0) * 10) / 10,
        peak: hours.reduce((best, h) => (h.demand > best.demand ? h : best), hours[0]),
        understaffedHours: under.length,
        driversNeeded: Math.max(0, ...under.map((h) => Math.ceil(h.gap / Math.max(0.2, p.tripsPerDriverHour)))),
      },
    };
  }

  /**
   * Pickup cells with the most expected requests for the slots covering
   * [at, at + hours). `driversNearby` counts live drivers within ~1 km so
   * the UI can mark undersupplied hotspots.
   */
  async hotspots(opts: { zoneId?: string | null; at?: Date; hours?: number; weeks?: number; limit?: number; near?: { lat: number; lng: number } | null } = {}) {
    const zoneId = opts.zoneId ?? null;
    const at = opts.at ?? new Date();
    const span = Math.max(1, Math.min(6, opts.hours ?? 2));
    const weeks = Math.max(1, Math.min(MAX_WEEKS, opts.weeks ?? 8));
    const limit = Math.max(1, Math.min(50, opts.limit ?? 10));
    const slots = nextHours(at, span).map((d) => slotOf(d, this.timeZone));

    const cells = await this.cached(`forecast:cells:${zoneId ?? 'all'}:${weeks}:${slots.map(slotIndex).join(',')}:${at.toISOString().slice(0, 13)}`, async () => {
      const since = new Date(at.getTime() - weeks * 7 * 86400_000);
      const slotPairs = slots.map((s) => Prisma.sql`(${s.dow}, ${s.hour})`);
      const rows = await this.prisma.$queryRaw<{ dow: number; hour: number; weekago: number; celllat: number; celllng: number; requests: bigint }[]>`
        SELECT EXTRACT(DOW FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int AS dow,
               EXTRACT(HOUR FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int AS hour,
               GREATEST(1, CEIL(EXTRACT(EPOCH FROM (${at}::timestamptz - "requestedAt")) / 604800))::int AS weekago,
               FLOOR("pickupLat" / ${CELL_DEG})::float8 AS celllat,
               FLOOR("pickupLng" / ${CELL_DEG})::float8 AS celllng,
               COUNT(*) AS requests
        FROM trips
        WHERE "requestedAt" >= ${since} AND "requestedAt" < ${at} ${this.zoneFilter(zoneId)}
          AND (EXTRACT(DOW FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int, EXTRACT(HOUR FROM ("requestedAt" AT TIME ZONE 'UTC' AT TIME ZONE ${this.timeZone}))::int) IN (${Prisma.join(slotPairs)})
        GROUP BY 1, 2, 3, 4, 5`;
      const byCell = new Map<string, { lat: number; lng: number; weeks: Map<number, number> }>();
      for (const r of rows) {
        const c = cellOf((Number(r.celllat) + 0.5) * CELL_DEG, (Number(r.celllng) + 0.5) * CELL_DEG);
        const entry = byCell.get(c.key) ?? { lat: c.lat, lng: c.lng, weeks: new Map<number, number>() };
        entry.weeks.set(r.weekago, (entry.weeks.get(r.weekago) ?? 0) + Number(r.requests));
        byCell.set(c.key, entry);
      }
      return [...byCell.entries()]
        .map(([key, c]) => ({ key, lat: c.lat, lng: c.lng, expectedRequests: Math.round((weightedMean(c.weeks, weeks) / span) * 100) / 100, weeksWithData: c.weeks.size }))
        .filter((c) => c.expectedRequests > 0)
        .sort((a, b) => b.expectedRequests - a.expectedRequests)
        .slice(0, 50);
    });

    const enriched = await Promise.all(
      cells.slice(0, Math.max(limit, 20)).map(async (c) => {
        const live = (await this.redis.nearbyDrivers(c.lat, c.lng, 1000, 20).catch(() => [])).filter((d) => !d.stale);
        const distanceMeters = opts.near ? Math.round(haversine(opts.near.lat, opts.near.lng, c.lat, c.lng)) : null;
        return { ...c, driversNearby: live.length, undersupplied: live.length < Math.ceil(c.expectedRequests), distanceMeters };
      }),
    );
    // Drivers want the nearest good spot; admins the biggest one.
    const sorted = opts.near
      ? enriched.sort((a, b) => b.expectedRequests / (1 + (b.distanceMeters ?? 0) / 2000) - a.expectedRequests / (1 + (a.distanceMeters ?? 0) / 2000))
      : enriched;
    return {
      at: at.toISOString(),
      hours: span,
      slots: slots.map((s) => `${SLOT_LABEL_DOW[s.dow]} ${String(s.hour).padStart(2, '0')}h`),
      cellSizeDeg: CELL_DEG,
      hotspots: sorted.slice(0, limit),
    };
  }

  /** Hotspots framed for one driver: their zone, ranked from their last known position. */
  async hotspotsForDriver(userId: string, limit = 5) {
    const driver = await this.prisma.driver.findUnique({ where: { userId }, select: { id: true, zoneId: true } });
    if (!driver) throw new NotFoundException('Không tìm thấy hồ sơ tài xế');
    const loc = await this.redis.getDriverLocation(driver.id);
    return this.hotspots({ zoneId: driver.zoneId, near: loc ? { lat: loc.lat, lng: loc.lng } : null, limit, hours: 2 });
  }
}

function haversine(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
