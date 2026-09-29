import type { GeoPlace, GeoProvider, GeoRoute } from '../geo.provider.js';

/**
 * Keyless development provider: Nominatim (geocoding) + public OSRM demo
 * server (routing). Rate-limited and not for production traffic — swap to
 * Goong/Mapbox via GEO_PROVIDER.
 */
export class OsmProvider implements GeoProvider {
  readonly name = 'osm';
  private readonly nominatim = process.env.NOMINATIM_URL ?? 'https://nominatim.openstreetmap.org';
  private readonly osrm = process.env.OSRM_URL ?? 'https://router.project-osrm.org';

  async autocomplete(query: string, near?: { lat: number; lng: number }): Promise<GeoPlace[]> {
    const params = new URLSearchParams({
      q: query,
      format: 'jsonv2',
      limit: '6',
      countrycodes: 'vn',
      'accept-language': 'vi',
    });
    if (near) {
      const d = 0.5;
      params.set('viewbox', `${near.lng - d},${near.lat + d},${near.lng + d},${near.lat - d}`);
      params.set('bounded', '0');
    }
    const res = await fetch(`${this.nominatim}/search?${params}`, {
      headers: { 'User-Agent': 'GhepGo-dev/0.1 (contact: dev@ghepgo.local)' },
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { display_name: string; lat: string; lon: string; name?: string }[];
    return data.map((p) => ({
      label: p.name || p.display_name.split(',')[0],
      address: p.display_name,
      lat: Number(p.lat),
      lng: Number(p.lon),
    }));
  }

  async reverse(lat: number, lng: number): Promise<GeoPlace | null> {
    const params = new URLSearchParams({
      lat: String(lat),
      lon: String(lng),
      format: 'jsonv2',
      zoom: '18',
      'accept-language': 'vi',
    });
    const res = await fetch(`${this.nominatim}/reverse?${params}`, {
      headers: { 'User-Agent': 'GhepGo-dev/0.1 (contact: dev@ghepgo.local)' },
    });
    if (!res.ok) return null;
    const p = (await res.json()) as { display_name?: string; name?: string; lat?: string; lon?: string; error?: string };
    if (!p.display_name) return null;
    return {
      label: p.name || p.display_name.split(',')[0],
      address: p.display_name,
      lat: p.lat ? Number(p.lat) : lat,
      lng: p.lon ? Number(p.lon) : lng,
    };
  }

  async route(points: { lat: number; lng: number }[]): Promise<GeoRoute | null> {
    if (points.length < 2) return null;
    const coords = points.map((p) => `${p.lng},${p.lat}`).join(';');
    const res = await fetch(`${this.osrm}/route/v1/driving/${coords}?overview=simplified&geometries=polyline`);
    if (!res.ok) return null;
    const data = (await res.json()) as { code: string; routes?: { distance: number; duration: number; geometry: string }[] };
    const r = data.routes?.[0];
    if (data.code !== 'Ok' || !r) return null;
    return { distanceMeters: Math.round(r.distance), durationSecs: Math.round(r.duration), polyline: r.geometry };
  }
}
