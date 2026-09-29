import { TestApp, expectStatus, HCM, tripBody, sleep } from './helpers.js';

describe('Trips, matching, realtime (e2e)', () => {
  const t = new TestApp();
  beforeAll(async () => {
    await t.start();
    await t.clearZones();
  });
  afterAll(() => t.stop());

  it('pools same-direction riders, re-matches mid-route, handles cancel and completes with settlement', async () => {
    const c1 = await t.register('CUSTOMER', 'C1');
    const c2 = await t.register('CUSTOMER', 'C2');
    const c3 = await t.register('CUSTOMER', 'C3');
    const d = await t.driverOnDuty('D1');

    const events: string[] = [];
    const sock = await t.socket(c1.token);
    sock.on('trip:updated', (p: any) => events.push(`trip:${p.status}`));
    sock.on('driver:location', () => events.push('location'));

    const s1 = await t.call('post', '/trips', { token: c1.token, body: tripBody(HCM.benThanh, HCM.tanSonNhat, { tripType: 'SHARED' }) });
    const s2 = await t.call('post', '/trips', { token: c2.token, body: tripBody(HCM.nhaTho, HCM.hoangVanThu, { tripType: 'SHARED' }) });
    expect(s1.groupId).toBe(s2.groupId);
    expect(Number(s2.fare)).toBeGreaterThan(0);
    await new Promise<void>((r) => sock.emit('subscribe:trip', { tripId: s1.id }, () => r()));

    const g = await t.call('post', `/trip-groups/${s1.groupId}/accept`, { token: d.token });
    expect(g.status).toBe('ASSIGNED');
    expect(g.stops.map((s: any) => s.kind)).toEqual(['PICKUP', 'PICKUP', 'DROPOFF', 'DROPOFF']);

    let adv = await t.call('patch', `/trip-groups/${g.id}/advance`, { token: d.token });
    expect(adv.status).toBe('IN_PROGRESS');
    await t.call('patch', '/drivers/me/location', { token: d.token, body: { lat: 10.78, lng: 106.695 } });

    const s3 = await t.call('post', '/trips', { token: c3.token, body: tripBody(HCM.tanDinh, HCM.langChaCa, { tripType: 'SHARED' }) });
    expect(s3.groupId).toBe(g.id);
    expect(s3.status).toBe('ACCEPTED');
    expect(s3.driverId).toBeTruthy();

    await t.call('post', `/trips/${s2.id}/cancel`, { token: c2.token });
    const mine = await t.call('get', '/trip-groups/mine', { token: d.token });
    const grp = mine.find((x: any) => x.id === g.id);
    expect(grp.seatsUsed).toBe(2);
    expect(grp.stops.some((s: any) => s.tripId === s2.id)).toBe(false);
    await expectStatus(t.call('post', `/trips/${s1.id}/cancel`, { token: c1.token }), 400); // already picked up

    let last = grp;
    while (last.currentStopIndex < last.stops.length) last = await t.call('patch', `/trip-groups/${g.id}/advance`, { token: d.token });
    expect(last.status).toBe('COMPLETED');
    const done = await t.call('get', `/trips/${s1.id}`, { token: c1.token });
    expect(done.status).toBe('COMPLETED');
    expect(done.payment.method).toBe('CASH');

    await sleep(300);
    expect(events).toContain('trip:ACCEPTED');
    expect(events).toContain('trip:COMPLETED');
    expect(events).toContain('location');
  });

  it('lets only one driver win a private trip and re-opens the driver on customer cancel', async () => {
    const c = await t.register('CUSTOMER');
    const d1 = await t.driverOnDuty('R1');
    const d2 = await t.driverOnDuty('R2');
    const p = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
    const race = await Promise.allSettled([
      t.call('post', `/trips/${p.id}/accept`, { token: d1.token }),
      t.call('post', `/trips/${p.id}/accept`, { token: d2.token }),
    ]);
    expect(race.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    await t.call('post', `/trips/${p.id}/cancel`, { token: c.token });
    const drivers = await Promise.all([t.call('get', '/drivers/me', { token: d1.token }), t.call('get', '/drivers/me', { token: d2.token })]);
    expect(drivers.every((x) => x.status === 'AVAILABLE')).toBe(true);
  });

  it('exposes nearby drivers and expires unanswered requests', async () => {
    const c = await t.register('CUSTOMER');
    await t.driverOnDuty('Near', { lat: 10.7735, lng: 106.6995 });
    const near = await t.call('get', `/drivers/nearby?lat=${HCM.benThanh.lat}&lng=${HCM.benThanh.lng}&radius=3000`, { token: c.token });
    expect(near.length).toBeGreaterThan(0);
    const suggest = await t.call('get', `/dispatch/suggest?lat=${HCM.benThanh.lat}&lng=${HCM.benThanh.lng}`, { token: c.token });
    expect(suggest[0].etaSecs).toBeGreaterThan(0);

    const p = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
    const { DispatchService } = await import('../src/dispatch/dispatch.service.js');
    const dispatch = t.app.get(DispatchService);
    const inOneHour = new Date(Date.now() + 3600_000);
    const r = await dispatch.expireStale(inOneHour);
    expect(r.trips).toBeGreaterThanOrEqual(1);
    const expired = await t.call('get', `/trips/${p.id}`, { token: c.token });
    expect(expired.status).toBe('CANCELLED');
  });
});
