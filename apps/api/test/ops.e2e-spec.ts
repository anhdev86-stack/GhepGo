import { TestApp, expectStatus, HCM, tripBody, sleep } from './helpers.js';

describe('Zones, complaints, notifications, reports (e2e)', () => {
  const t = new TestApp();
  beforeAll(async () => {
    await t.start();
    await t.clearZones();
  });
  afterAll(async () => {
    await t.clearZones();
    await t.stop();
  });

  it('enforces service zones for booking, pooling and driver visibility (circle + polygon)', async () => {
    const admin = await t.admin();
    const hcm = await t.call('post', '/admin/zones', { token: admin.token, body: { name: `HCM-${Date.now()}`, centerLat: 10.7769, centerLng: 106.7009, radiusKm: 12 } });
    const td = await t.call('post', '/admin/zones', { token: admin.token, body: { name: `TD-${Date.now()}`, polygon: [[10.83, 106.74], [10.83, 106.80], [10.89, 106.80], [10.89, 106.74]] } });
    expect(td.polygon.type).toBe('Polygon');
    await expectStatus(t.call('post', '/admin/zones', { token: admin.token, body: { name: 'bowtie', polygon: [[106.60, 10.60], [106.70, 10.70], [106.70, 10.60], [106.60, 10.70]] } }), 400);

    const c1 = await t.register('CUSTOMER');
    const c2 = await t.register('CUSTOMER');
    const c3 = await t.register('CUSTOMER');
    await expectStatus(t.call('post', '/trips', { token: c1.token, body: tripBody({ lat: 16.05, lng: 108.2 }, { lat: 16.06, lng: 108.21 }) }), 400, 'ngoài vùng');
    const s1 = await t.call('post', '/trips', { token: c1.token, body: tripBody(HCM.benThanh, HCM.tanSonNhat, { tripType: 'SHARED' }) });
    const s2 = await t.call('post', '/trips', { token: c2.token, body: tripBody(HCM.nhaTho, HCM.hoangVanThu, { tripType: 'SHARED' }) });
    const s3 = await t.call('post', '/trips', { token: c3.token, body: tripBody({ lat: 10.85, lng: 106.76 }, { lat: 10.86, lng: 106.78 }, { tripType: 'SHARED' }) });
    expect(s1.groupId).toBe(s2.groupId);
    expect(s3.groupId).not.toBe(s1.groupId);
    expect(s3.pickupZoneId).toBe(td.id);

    const dH = await t.driverOnDuty('H');
    const dT = await t.driverOnDuty('T', { lat: 10.85, lng: 106.76 });
    const drivers = await t.call('get', '/drivers', { token: admin.token });
    const idOf = (s: { user: { id: string } }) => drivers.find((d: any) => d.userId === s.user.id).id;
    await t.call('patch', `/admin/drivers/${idOf(dH)}/zone`, { token: admin.token, body: { zoneId: hcm.id } });
    await t.call('patch', `/admin/drivers/${idOf(dT)}/zone`, { token: admin.token, body: { zoneId: td.id } });
    const seenT = await t.call('get', '/trip-groups/available', { token: dT.token });
    expect(seenT.every((g: any) => g.zone?.id === td.id)).toBe(true);
    await expectStatus(t.call('post', `/trip-groups/${s3.groupId}/accept`, { token: dH.token }), 400, 'khu vực');
    expect((await t.call('post', `/trip-groups/${s3.groupId}/accept`, { token: dT.token })).status).toBe('ASSIGNED');
    await expectStatus(t.call('delete', `/admin/zones/${hcm.id}`, { token: admin.token }), 400);
    const stats = await t.call('get', '/admin/reports/zones', { token: admin.token });
    expect(stats.zones.find((z: any) => z.id === td.id).requested).toBe(1);
    await t.clearZones();
  });

  it('complaint lifecycle with refund and notifications', async () => {
    const admin = await t.admin();
    const c = await t.register('CUSTOMER');
    const stranger = await t.register('CUSTOMER');
    const d = await t.driverOnDuty();
    const trip = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
    await expectStatus(t.call('post', '/complaints', { token: c.token, body: { tripId: trip.id, category: 'FARE', description: 'Giá cước cao hơn báo giá' } }), 400);
    await t.call('post', `/trips/${trip.id}/accept`, { token: d.token });
    for (const status of ['EN_ROUTE_TO_PICKUP', 'IN_PROGRESS', 'COMPLETED']) await t.call('patch', `/trips/${trip.id}/status`, { token: d.token, body: { status } });

    await expectStatus(t.call('post', '/complaints', { token: stranger.token, body: { tripId: trip.id, category: 'FARE', description: 'Không phải chuyến của tôi' } }), 403);
    const cp = await t.call('post', '/complaints', { token: c.token, body: { tripId: trip.id, category: 'ROUTE', description: 'Tài xế đi vòng xa hơn lộ trình' } });
    expect(cp.againstUser.id).toBe(d.user.id);
    await expectStatus(t.call('post', '/complaints', { token: c.token, body: { tripId: trip.id, category: 'FARE', description: 'Khiếu nại thứ hai cùng chuyến' } }), 400);
    await expectStatus(t.call('get', `/complaints/${cp.id}`, { token: stranger.token }), 403);
    const afterAdmin = await t.call('post', `/complaints/${cp.id}/messages`, { token: admin.token, body: { body: 'Đang kiểm tra GPS' } });
    expect(afterAdmin.status).toBe('IN_REVIEW');
    await expectStatus(t.call('patch', `/admin/complaints/${cp.id}`, { token: admin.token, body: { status: 'RESOLVED', refundAmount: 99999999 } }), 400);
    const res = await t.call('patch', `/admin/complaints/${cp.id}`, { token: admin.token, body: { status: 'RESOLVED', resolution: 'Hoàn 20.000 đ', refundAmount: 20000, chargeDriver: true } });
    expect(res.status).toBe('RESOLVED');
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(20000);
    await expectStatus(t.call('post', `/complaints/${cp.id}/messages`, { token: c.token, body: { body: 'cảm ơn' } }), 400);

    await sleep(300);
    const titles = (await t.call('get', '/notifications', { token: c.token })).map((n: any) => n.title);
    expect(titles.some((x: string) => x.includes('Khiếu nại đã giải quyết'))).toBe(true);
    expect(titles).toContain('Chuyến đi hoàn thành');
    expect((await t.call('get', '/notifications/unread-count', { token: c.token })).count).toBeGreaterThan(0);
    await t.call('patch', '/notifications/read-all', { token: c.token });
    expect((await t.call('get', '/notifications/unread-count', { token: c.token })).count).toBe(0);
  });

  it('registers push devices, rates trips, reports KPIs', async () => {
    const admin = await t.admin();
    const c = await t.register('CUSTOMER');
    const d = await t.driverOnDuty();
    expect((await t.call('post', '/notifications/devices', { token: d.token, body: { kind: 'EXPO', token: 'ExponentPushToken[e2e0000000000000000000]', platform: 'android' } })).kind).toBe('EXPO');
    await expectStatus(t.call('post', '/notifications/devices', { token: d.token, body: { kind: 'EXPO', token: 'nope' } }), 400);
    const trip = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
    await t.call('post', `/trips/${trip.id}/accept`, { token: d.token });
    for (const status of ['EN_ROUTE_TO_PICKUP', 'IN_PROGRESS', 'COMPLETED']) await t.call('patch', `/trips/${trip.id}/status`, { token: d.token, body: { status } });
    await t.call('post', `/trips/${trip.id}/rating`, { token: c.token, body: { score: 4 } });
    await expectStatus(t.call('post', `/trips/${trip.id}/rating`, { token: c.token, body: { score: 5 } }), 400);
    const stats = await t.call('get', '/drivers/me/stats', { token: d.token });
    expect(stats.trips.completed).toBe(1);
    expect(stats.driver.ratingAvg).toBe(4);
    const ov = await t.call('get', '/admin/reports/overview', { token: admin.token });
    expect(ov.revenue.grossFare).toBeGreaterThan(0);
  });

  it('serves map config, multi-point routes and reverse geocoding (offline fallback)', async () => {
    const c = await t.register('CUSTOMER');
    const cfg = await t.call('get', '/geo/provider', { token: c.token });
    expect(cfg.provider).toBe('osm');
    expect(cfg.tiles.url).toContain('{z}');
    // Provider is unreachable in tests → straight-line estimate, no polyline.
    const pts = [HCM.benThanh, HCM.nhaTho, HCM.tanDinh].map((p) => `${p.lat},${p.lng}`).join(';');
    const r = await t.call('get', `/geo/route?points=${pts}`, { token: c.token });
    expect(r.estimated).toBe(true);
    expect(r.distanceMeters).toBeGreaterThan(1000);
    expect(r.polyline).toBeUndefined();
    await expectStatus(t.call('get', '/geo/route?points=10.7,106.6', { token: c.token }), 400);
    await expectStatus(t.call('get', '/geo/route', { token: c.token }), 400);
    expect((await t.call('get', `/geo/reverse?lat=${HCM.benThanh.lat}&lng=${HCM.benThanh.lng}`, { token: c.token })).place).toBeNull();
    const trip = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
    expect(trip.routePolyline).toBeNull();
  });
});
