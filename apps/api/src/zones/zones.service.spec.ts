import { ConfigService } from '@nestjs/config';
import { ZonesService } from './zones.service.js';

describe('ZonesService.normalizeRing', () => {
  it('accepts GeoJSON Polygon / Feature and closes the ring', () => {
    const geo = { type: 'Polygon', coordinates: [[[106.6, 10.7], [106.8, 10.7], [106.8, 10.9]]] };
    const ring = ZonesService.normalizeRing(geo);
    expect(ring).toHaveLength(4);
    expect(ring[0]).toEqual([106.6, 10.7]);
    expect(ring[3]).toEqual([106.6, 10.7]);
    expect(ZonesService.normalizeRing({ type: 'Feature', geometry: geo })).toEqual(ring);
  });

  it('accepts [lat,lng] pairs and swaps them to [lng,lat]', () => {
    const ring = ZonesService.normalizeRing([[10.7, 106.6], [10.7, 106.8], [10.9, 106.8], [10.7, 106.6]]);
    expect(ring[0]).toEqual([106.6, 10.7]);
    expect(ring).toHaveLength(4);
  });

  it('rejects too few or invalid points', () => {
    expect(() => ZonesService.normalizeRing([[106.6, 10.7], [106.8, 10.7]])).toThrow('ít nhất 3');
    expect(() => ZonesService.normalizeRing([[106.6, 10.7], ['x', 10.7], [106.8, 10.9]])).toThrow('không hợp lệ');
    expect(() => ZonesService.normalizeRing([[200, 10.7], [106.8, 10.7], [106.8, 10.9]])).toThrow('phạm vi');
  });
});

describe('ZonesService enforcement', () => {
  const zone = { id: 'z', name: 'Z', centerLat: 10.7, centerLng: 106.7, radiusKm: 5, hasPolygon: true };
  const mk = (config: Record<string, string>, inside: boolean, count = 1) =>
    new ZonesService(
      { $queryRaw: async () => (inside ? [zone] : []), serviceZone: { count: async () => count } } as never,
      new ConfigService(config),
    );
  const p = { lat: 10.7, lng: 106.7 };

  it('pickup enforcement by default', async () => {
    expect((await mk({}, true).checkTrip(p, p)).ok).toBe(true);
    expect((await mk({}, false).checkTrip(p, p)).ok).toBe(false);
  });
  it('off / no zones → always ok', async () => {
    expect((await mk({ ZONE_ENFORCEMENT: 'off' }, false).checkTrip(p, p)).ok).toBe(true);
    expect((await mk({}, false, 0).checkTrip(p, p)).ok).toBe(true);
  });
  it('driver filters', () => {
    const svc = mk({}, true);
    expect(svc.driverZoneFilter(null)).toEqual({});
    expect(svc.driverZoneFilter('q1')).toEqual({ pickupZoneId: 'q1' });
    expect(svc.driverAllowed('q1', 'hcm')).toBe(false);
    expect(svc.driverAllowed(null, null)).toBe(true);
  });
});
