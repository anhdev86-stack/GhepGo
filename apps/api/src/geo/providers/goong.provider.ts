import type { GeoPlace, GeoProvider, GeoRoute } from '../geo.provider.js';

/** Goong Maps (https://docs.goong.io) — set GEO_PROVIDER=goong and GOONG_API_KEY. */
export class GoongProvider implements GeoProvider {
  readonly name = 'goong';
  private readonly base = 'https://rsapi.goong.io';

  constructor(private apiKey: string) {}

  async autocomplete(query: string, near?: { lat: number; lng: number }): Promise<GeoPlace[]> {
    const params = new URLSearchParams({ api_key: this.apiKey, input: query, limit: '6' });
    if (near) params.set('location', `${near.lat},${near.lng}`);
    const res = await fetch(`${this.base}/Place/AutoComplete?${params}`);
    if (!res.ok) return [];
    const data = (await res.json()) as {
      predictions?: { description: string; place_id: string; structured_formatting?: { main_text?: string } }[];
    };
    const preds = data.predictions ?? [];
    // Autocomplete has no coordinates; resolve each place (cheap Goong call).
    const places = await Promise.all(
      preds.map(async (p) => {
        const detail = await fetch(`${this.base}/Place/Detail?place_id=${p.place_id}&api_key=${this.apiKey}`);
        if (!detail.ok) return null;
        const d = (await detail.json()) as { result?: { geometry?: { location?: { lat: number; lng: number } } } };
        const loc = d.result?.geometry?.location;
        if (!loc) return null;
        return {
          label: p.structured_formatting?.main_text ?? p.description,
          address: p.description,
          lat: loc.lat,
          lng: loc.lng,
        } satisfies GeoPlace;
      }),
    );
    return places.filter((p): p is GeoPlace => !!p);
  }

  async route(points: { lat: number; lng: number }[]): Promise<GeoRoute | null> {
    if (points.length < 2) return null;
    const origin = `${points[0].lat},${points[0].lng}`;
    const destination = points
      .slice(1)
      .map((p) => `${p.lat},${p.lng}`)
      .join(';');
    const params = new URLSearchParams({ api_key: this.apiKey, origin, destination, vehicle: 'car' });
    const res = await fetch(`${this.base}/Direction?${params}`);
    if (!res.ok) return null;
    const data = (await res.json()) as {
      routes?: { legs: { distance: { value: number }; duration: { value: number } }[]; overview_polyline?: { points: string } }[];
    };
    const r = data.routes?.[0];
    if (!r) return null;
    return {
      distanceMeters: Math.round(r.legs.reduce((s, l) => s + l.distance.value, 0)),
      durationSecs: Math.round(r.legs.reduce((s, l) => s + l.duration.value, 0)),
      polyline: r.overview_polyline?.points,
    };
  }
}
