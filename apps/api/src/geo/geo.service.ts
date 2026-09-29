import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RedisService } from '../redis/redis.service.js';
import { estimateDurationSecs, haversineDistanceMeters } from '../common/geo.util.js';
import type { GeoPlace, GeoProvider, GeoRoute } from './geo.provider.js';
import { OsmProvider } from './providers/osm.provider.js';
import { GoongProvider } from './providers/goong.provider.js';

const ROUTE_CACHE_TTL_SECS = 600;
const AUTOCOMPLETE_CACHE_TTL_SECS = 3600;
const REVERSE_CACHE_TTL_SECS = 86400;
const PROVIDER_TIMEOUT_MS = 4000;

/** Raster tile layer the web/mobile maps draw; keyless OSM by default. */
export interface MapTiles {
  url: string;
  attribution: string;
  maxZoom: number;
}

const OSM_TILES: MapTiles = {
  url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
  maxZoom: 19,
};

/**
 * Facade over the configured map provider with Redis caching and a
 * straight-line fallback so booking never fails because of a map outage.
 */
@Injectable()
export class GeoService {
  private readonly logger = new Logger(GeoService.name);
  private readonly provider: GeoProvider;
  readonly tiles: MapTiles;

  constructor(
    config: ConfigService,
    private redis: RedisService,
  ) {
    const name = (config.get<string>('GEO_PROVIDER') ?? 'osm').toLowerCase();
    const goongKey = config.get<string>('GOONG_API_KEY');
    this.provider = name === 'goong' && goongKey ? new GoongProvider(goongKey) : new OsmProvider();
    if (name === 'goong' && !goongKey) this.logger.warn('GEO_PROVIDER=goong but GOONG_API_KEY missing, using OSM');
    this.logger.log(`Map provider: ${this.provider.name}`);

    // MAP_TILE_URL lets production point at Goong/Mapbox/self-hosted raster tiles ({z}/{x}/{y} template).
    const tileUrl = config.get<string>('MAP_TILE_URL')?.trim();
    this.tiles = tileUrl
      ? {
          url: tileUrl,
          attribution: config.get<string>('MAP_TILE_ATTRIBUTION') ?? OSM_TILES.attribution,
          maxZoom: Number(config.get<string>('MAP_TILE_MAX_ZOOM') ?? 19),
        }
      : OSM_TILES;
  }

  get providerName() {
    return this.provider.name;
  }

  /** What map clients need to draw: provider name + raster tile layer. */
  config() {
    return { provider: this.provider.name, tiles: this.tiles };
  }

  async reverse(lat: number, lng: number): Promise<GeoPlace | null> {
    const key = `geo:rev:${this.provider.name}:${lat.toFixed(5)},${lng.toFixed(5)}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached);
    try {
      const place = await this.withTimeout(this.provider.reverse(lat, lng));
      if (place) await this.redis.client.set(key, JSON.stringify(place), 'EX', REVERSE_CACHE_TTL_SECS).catch(() => undefined);
      return place;
    } catch (err) {
      this.logger.warn(`reverse failed: ${(err as Error).message}`);
      return null;
    }
  }

  private withTimeout<T>(p: Promise<T>): Promise<T> {
    return Promise.race([
      p,
      new Promise<T>((_, reject) => setTimeout(() => reject(new Error('geo provider timeout')), PROVIDER_TIMEOUT_MS)),
    ]);
  }

  async autocomplete(query: string, near?: { lat: number; lng: number }): Promise<GeoPlace[]> {
    const q = query.trim();
    if (q.length < 2) return [];
    const key = `geo:ac:${this.provider.name}:${q.toLowerCase()}:${near ? `${near.lat.toFixed(2)},${near.lng.toFixed(2)}` : ''}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return JSON.parse(cached);
    try {
      const places = await this.withTimeout(this.provider.autocomplete(q, near));
      await this.redis.client.set(key, JSON.stringify(places), 'EX', AUTOCOMPLETE_CACHE_TTL_SECS).catch(() => undefined);
      return places;
    } catch (err) {
      this.logger.warn(`autocomplete failed: ${(err as Error).message}`);
      return [];
    }
  }

  /**
   * Road distance/duration for an ordered list of points. Falls back to
   * Haversine × 1.3 (typical urban detour factor) when the provider fails.
   */
  async route(points: { lat: number; lng: number }[]): Promise<GeoRoute & { estimated: boolean }> {
    const key = `geo:route:${this.provider.name}:${points.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join(';')}`;
    const cached = await this.redis.client.get(key).catch(() => null);
    if (cached) return { ...JSON.parse(cached), estimated: false };
    try {
      const r = await this.withTimeout(this.provider.route(points));
      if (r) {
        await this.redis.client.set(key, JSON.stringify(r), 'EX', ROUTE_CACHE_TTL_SECS).catch(() => undefined);
        return { ...r, estimated: false };
      }
    } catch (err) {
      this.logger.warn(`route failed: ${(err as Error).message}`);
    }
    let straight = 0;
    for (let i = 1; i < points.length; i++) {
      straight += haversineDistanceMeters(points[i - 1].lat, points[i - 1].lng, points[i].lat, points[i].lng);
    }
    const distanceMeters = Math.round(straight * 1.3);
    return { distanceMeters, durationSecs: estimateDurationSecs(distanceMeters), estimated: true };
  }
}
