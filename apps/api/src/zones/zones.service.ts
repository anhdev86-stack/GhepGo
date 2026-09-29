import { BadRequestException, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '../../generated/prisma/index.js';
import { PrismaService } from '../prisma/prisma.service.js';

export type ZoneEnforcement = 'off' | 'pickup' | 'both';

export interface ZoneLite {
  id: string;
  name: string;
  centerLat: number;
  centerLng: number;
  radiusKm: number;
  hasPolygon: boolean;
}

/** [lng, lat] pairs, GeoJSON order. */
export type Ring = [number, number][];

const COUNT_CACHE_TTL_MS = 30_000;

/**
 * Service-area logic (PostGIS).
 *
 *  - A zone is a polygon (`geom`, geography WGS84) or, when no polygon has
 *    been drawn, a circle around (centerLat, centerLng) with radiusKm.
 *  - A point belongs to the smallest active zone covering it (ST_Covers for
 *    polygons, ST_DWithin for circles), evaluated in SQL with the GIST index.
 *  - ZONE_ENFORCEMENT: off | pickup (default) | both — skipped automatically
 *    while no active zone exists.
 */
@Injectable()
export class ZonesService {
  readonly enforcement: ZoneEnforcement;
  private countCache: { at: number; count: number } | null = null;

  constructor(
    private prisma: PrismaService,
    config: ConfigService,
  ) {
    const raw = (config.get<string>('ZONE_ENFORCEMENT') ?? 'pickup').toLowerCase();
    this.enforcement = raw === 'off' || raw === 'both' ? raw : 'pickup';
  }

  invalidate() {
    this.countCache = null;
  }

  async activeZoneCount(): Promise<number> {
    if (this.countCache && Date.now() - this.countCache.at < COUNT_CACHE_TTL_MS) return this.countCache.count;
    const count = await this.prisma.serviceZone.count({ where: { isActive: true } });
    this.countCache = { at: Date.now(), count };
    return count;
  }

  /** Smallest active zone covering the point, or null. */
  async resolve(lat: number, lng: number): Promise<ZoneLite | null> {
    const rows = await this.prisma.$queryRaw<ZoneLite[]>`
      SELECT id, name, "centerLat", "centerLng", "radiusKm", (geom IS NOT NULL) AS "hasPolygon"
      FROM service_zones
      WHERE "isActive"
        AND CASE
              WHEN geom IS NOT NULL THEN ST_Covers(geom, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography)
              ELSE ST_DWithin(
                     ST_SetSRID(ST_MakePoint("centerLng", "centerLat"), 4326)::geography,
                     ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
                     "radiusKm" * 1000)
            END
      ORDER BY COALESCE(ST_Area(geom), pi() * power("radiusKm" * 1000, 2)) ASC
      LIMIT 1`;
    return rows[0] ?? null;
  }

  async checkTrip(pickup: { lat: number; lng: number }, dropoff: { lat: number; lng: number }) {
    const pickupZone = await this.resolve(pickup.lat, pickup.lng);
    if (this.enforcement === 'off' || (await this.activeZoneCount()) === 0) return { ok: true as const, pickupZone };
    if (!pickupZone) {
      return { ok: false as const, pickupZone, message: 'Điểm đón nằm ngoài vùng phục vụ hiện tại' };
    }
    if (this.enforcement === 'both' && !(await this.resolve(dropoff.lat, dropoff.lng))) {
      return { ok: false as const, pickupZone, message: 'Điểm trả nằm ngoài vùng phục vụ hiện tại' };
    }
    return { ok: true as const, pickupZone };
  }

  driverZoneFilter(driverZoneId: string | null): { pickupZoneId?: string } {
    return driverZoneId ? { pickupZoneId: driverZoneId } : {};
  }

  driverAllowed(driverZoneId: string | null, zoneId: string | null) {
    return !driverZoneId || driverZoneId === zoneId;
  }

  // ---------------- polygons ----------------

  /** Accepts a GeoJSON Polygon, a bare ring, or [lat,lng] pairs; returns a closed [lng,lat] ring. */
  static normalizeRing(input: unknown): Ring {
    let ring: unknown = input;
    if (ring && typeof ring === 'object' && !Array.isArray(ring)) {
      const g = ring as { type?: string; coordinates?: unknown; geometry?: unknown };
      if (g.type === 'Feature') ring = (g.geometry as { coordinates?: unknown })?.coordinates;
      else ring = g.coordinates;
    }
    if (Array.isArray(ring) && Array.isArray(ring[0]) && Array.isArray(ring[0][0])) ring = ring[0]; // outer ring of Polygon
    if (!Array.isArray(ring) || ring.length < 3) throw new BadRequestException('Đa giác cần ít nhất 3 điểm');
    const pts: Ring = (ring as unknown[]).map((p, i) => {
      if (!Array.isArray(p) || p.length < 2 || !Number.isFinite(Number(p[0])) || !Number.isFinite(Number(p[1]))) {
        throw new BadRequestException(`Điểm thứ ${i + 1} không hợp lệ`);
      }
      return [Number(p[0]), Number(p[1])];
    });
    // Heuristic: if every first component looks like a latitude (|x| ≤ 90) and second like a VN longitude, treat as [lat,lng].
    const looksLatLng = pts.every(([a, b]) => Math.abs(a) <= 90 && Math.abs(b) > 90);
    const lngLat: Ring = looksLatLng ? pts.map(([a, b]) => [b, a]) : pts;
    for (const [lng, lat] of lngLat) {
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) throw new BadRequestException('Toạ độ ngoài phạm vi hợp lệ');
    }
    const [f0, f1] = lngLat[0];
    const [l0, l1] = lngLat[lngLat.length - 1];
    if (f0 !== l0 || f1 !== l1) lngLat.push([f0, f1]);
    if (lngLat.length < 4) throw new BadRequestException('Đa giác cần ít nhất 3 điểm khác nhau');
    return lngLat;
  }

  private wkt(ring: Ring) {
    return `SRID=4326;POLYGON((${ring.map(([lng, lat]) => `${lng} ${lat}`).join(', ')}))`;
  }

  /** Validates with PostGIS and stores the polygon; also recentres the circle fallback on the centroid. */
  async setPolygon(zoneId: string, input: unknown) {
    const ring = ZonesService.normalizeRing(input);
    const wkt = this.wkt(ring);
    const [check] = await this.prisma.$queryRaw<{ valid: boolean; reason: string; area: number; lat: number; lng: number }[]>`
      SELECT ST_IsValid(g) AS valid, ST_IsValidReason(g) AS reason,
             ST_Area(g::geography) AS area,
             ST_Y(ST_Centroid(g)) AS lat, ST_X(ST_Centroid(g)) AS lng
      FROM (SELECT ST_GeomFromEWKT(${wkt}) AS g) s`;
    if (!check?.valid) throw new BadRequestException(`Đa giác không hợp lệ: ${check?.reason ?? 'unknown'}`);
    if (check.area < 10_000) throw new BadRequestException('Đa giác quá nhỏ (dưới 0,01 km²)');
    if (check.area > 50_000_000_000) throw new BadRequestException('Đa giác quá lớn (trên 50.000 km²)');
    await this.prisma.$executeRaw`
      UPDATE service_zones
      SET geom = ST_GeogFromText(${wkt}),
          "centerLat" = ${check.lat}, "centerLng" = ${check.lng},
          "radiusKm" = GREATEST(0.5, sqrt(${check.area} / pi()) / 1000)
      WHERE id = ${zoneId}`;
    this.invalidate();
    return { areaKm2: Math.round(check.area / 1e4) / 100, centroid: { lat: check.lat, lng: check.lng } };
  }

  async clearPolygon(zoneId: string) {
    await this.prisma.$executeRaw`UPDATE service_zones SET geom = NULL WHERE id = ${zoneId}`;
    this.invalidate();
  }

  /** GeoJSON polygons + areas for a set of zones (empty polygon when circle-only). */
  async polygons(zoneIds?: string[]) {
    const where = zoneIds && zoneIds.length > 0 ? Prisma.sql`WHERE id IN (${Prisma.join(zoneIds)})` : Prisma.empty;
    const rows = await this.prisma.$queryRaw<{ id: string; polygon: unknown; areaKm2: number | null }[]>`
      SELECT id, ST_AsGeoJSON(geom)::json AS polygon, ST_Area(geom) / 1e6 AS "areaKm2"
      FROM service_zones ${where}`;
    return new Map(rows.map((r) => [r.id, { polygon: r.polygon as { type: 'Polygon'; coordinates: Ring[] } | null, areaKm2: r.areaKm2 }]));
  }
}
