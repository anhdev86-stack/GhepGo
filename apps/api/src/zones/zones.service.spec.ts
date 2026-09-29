import { ConfigService } from '@nestjs/config';
import { ZonesService } from './zones.service.js';

const zones = [
  { id: 'hcm', name: 'TP.HCM', centerLat: 10.7769, centerLng: 106.7009, radiusKm: 25 },
  { id: 'q1', name: 'Quận 1', centerLat: 10.7769, centerLng: 106.7009, radiusKm: 3 },
  { id: 'hn', name: 'Hà Nội', centerLat: 21.0285, centerLng: 105.8542, radiusKm: 20 },
];
const prisma = { serviceZone: { findMany: async () => zones } } as never;

describe('ZonesService', () => {
  it('resolves the smallest containing zone', async () => {
    const svc = new ZonesService(prisma, new ConfigService({}));
    expect((await svc.resolve(10.78, 106.70))?.id).toBe('q1');
    expect((await svc.resolve(10.85, 106.65))?.id).toBe('hcm');
    expect((await svc.resolve(21.03, 105.85))?.id).toBe('hn');
    expect(await svc.resolve(16.05, 108.2)).toBeNull(); // Đà Nẵng, no zone
  });

  it('enforces pickup by default and both when configured', async () => {
    const dflt = new ZonesService(prisma, new ConfigService({}));
    expect((await dflt.checkTrip({ lat: 10.78, lng: 106.7 }, { lat: 16.05, lng: 108.2 })).ok).toBe(true);
    expect((await dflt.checkTrip({ lat: 16.05, lng: 108.2 }, { lat: 10.78, lng: 106.7 })).ok).toBe(false);
    const both = new ZonesService(prisma, new ConfigService({ ZONE_ENFORCEMENT: 'both' }));
    expect((await both.checkTrip({ lat: 10.78, lng: 106.7 }, { lat: 16.05, lng: 108.2 })).ok).toBe(false);
    const off = new ZonesService(prisma, new ConfigService({ ZONE_ENFORCEMENT: 'off' }));
    expect((await off.checkTrip({ lat: 16.05, lng: 108.2 }, { lat: 16.05, lng: 108.2 })).ok).toBe(true);
  });

  it('skips enforcement while no zones exist', async () => {
    const empty = new ZonesService({ serviceZone: { findMany: async () => [] } } as never, new ConfigService({}));
    const r = await empty.checkTrip({ lat: 16.05, lng: 108.2 }, { lat: 16.05, lng: 108.2 });
    expect(r.ok).toBe(true);
    expect(r.pickupZone).toBeNull();
  });

  it('driver filters', () => {
    const svc = new ZonesService(prisma, new ConfigService({}));
    expect(svc.driverZoneFilter(null)).toEqual({});
    expect(svc.driverZoneFilter('q1')).toEqual({ pickupZoneId: 'q1' });
    expect(svc.driverAllowed(null, 'q1')).toBe(true);
    expect(svc.driverAllowed('q1', 'q1')).toBe(true);
    expect(svc.driverAllowed('q1', 'hcm')).toBe(false);
    expect(svc.driverAllowed('q1', null)).toBe(false);
  });
});
