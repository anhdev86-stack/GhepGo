import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service.js';
import { haversineDistanceMeters } from '../common/geo.util.js';

export type ZoneEnforcement = 'off' | 'pickup' | 'both';

export interface ZoneLite {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
}

const CACHE_TTL_MS = 30_000;

/**
 * Service-area logic shared by booking, matching and driver availability.
 *
 *  - A point belongs to the smallest active zone (circle) containing it.
 *  - ZONE_ENFORCEMENT: off    → zones are only used for grouping/filtering
 *                      pickup → pickup must be inside a zone (default)
 *                      both   → pickup and dropoff must be inside zones
 *    Enforcement is skipped automatically while no active zone exists
 *    (fresh install), so the platform works before zones are configured.
 */
@Injectable()
export class ZonesService {
  private readonly logger = new Logger(ZonesService.name);
  readonly enforcement: ZoneEnforcement;
  private cache: { at: number; zones: ZoneLite[] } | null = null;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = (config.get<string>('ZONE_ENFORCEMENT') ?? 'pickup').toLowerCase();
    this.enforcement = raw === 'off' || raw === 'both' ? raw : 'pickup';
  }

  invalidate() {
    this.cache = null;
  }

  async activeZones(): Promise<ZoneLite[]> {
    if (this.cache && Date.now() - this.cache.at < CACHE_TTL_MS) return this.cache.zones;
    const zones = await this.prisma.serviceZone.findMany({
      where: { isActive: true },
      select: { id: true, name: true, centerLat: true, centerLng: true, radiusKm: true },
    });
    this.cache = { at: Date.now(), zones };
    return zones;
  }

  /** Smallest active zone containing the point, or null. */
  async resolve(lat: number, lng: number): Promise<ZoneLite | null> {
    const zones = await this.activeZones();
    let best: ZoneLite | null = null;
    for (const z of zones) {
      if (haversineDistanceMeters(lat, lng, z.centerLat, z.centerLng) <= z.radiusKm * 1000) {
        if (!best || z.radiusKm < best.radiusKm) best = z;
      }
    }
    return best;
  }

  /**
   * Validates a booking against the service area. Returns the pickup zone
   * (null when zones are not configured) or an error message.
   */
  async checkTrip(pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) {
    const zones = await this.activeZones();
    const pickupZone = await this.resolve(pickup.lat, pickup.lng);
    if (zones.length === 0 || this.enforcement === 'off') return { ok: true as const, pickupZone };
    if (!pickupZone) {
      return { ok: false as const, pickupZone, message: 'Điểm đón nằm ngoài vùng phục vụ hiện tại' };
    }
    if (this.enforcement === 'both' && !(await this.resolve(dropoff.lat, dropoff.lng))) {
      return { ok: false as const, pickupZone, message: 'Điểm trả nằm ngoài vùng phục vụ hiện tại' };
    }
    return { ok: true as const, pickupZone };
  }

  /** Where-clause fragment: a driver with a zone only sees work whose pickup zone matches. */
  driverZoneFilter(driverZoneId: string | null): { pickupZoneId?: string } {
    return driverZoneId ? { pickupZoneId: driverZoneId } : {};
  }

  /** Whether a driver may take work in `zoneId` (unassigned drivers may take anything). */
  driverAllowed(driverZoneId: string | null, zoneId: string | null) {
    return !driverZoneId || driverZoneId === zoneId;
  }
}
