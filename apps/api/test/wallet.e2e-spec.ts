import { createHmac } from 'node:crypto';
import { TestApp, expectStatus, HCM, tripBody } from './helpers.js';

const runTrip = async (t: TestApp, customer: string, driver: string, extra: Record<string, unknown> = {}) => {
  const trip = await t.call('post', '/trips', { token: customer, body: tripBody(HCM.benThanh, HCM.tanSonNhat, extra) });
  await t.call('post', `/trips/${trip.id}/accept`, { token: driver });
  for (const status of ['EN_ROUTE_TO_PICKUP', 'IN_PROGRESS', 'COMPLETED']) {
    await t.call('patch', `/trips/${trip.id}/status`, { token: driver, body: { status } });
  }
  return t.call('get', `/trips/${trip.id}`, { token: customer });
};

describe('Wallet, settlement, gateways (e2e)', () => {
  const t = new TestApp();
  beforeAll(async () => {
    await t.start();
    await t.clearZones();
  });
  afterAll(() => t.stop());

  it('mock top-up is signed, idempotent and credits once', async () => {
    const c = await t.register('CUSTOMER');
    const top = await t.call('post', '/wallet/topup', { token: c.token, body: { amount: 200000, gateway: 'mock' } });
    const { signature } = await t.call('post', '/wallet/topup/mock-sign', { token: c.token, body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G1' } });
    await t.call('post', '/wallet/topup/callback', { body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G1', signature } });
    await t.call('post', '/wallet/topup/callback', { body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G1', signature } });
    await expectStatus(t.call('post', '/wallet/topup/callback', { body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G1', signature: 'bad' } }), 403);
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(200000);
  });

  it('settles WALLET and CASH trips with commission, falls back to CASH when the wallet is short', async () => {
    const c = await t.register('CUSTOMER');
    const d = await t.driverOnDuty();
    const top = await t.call('post', '/wallet/topup', { token: c.token, body: { amount: 500000, gateway: 'mock' } });
    const { signature } = await t.call('post', '/wallet/topup/mock-sign', { token: c.token, body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G2' } });
    await t.call('post', '/wallet/topup/callback', { body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G2', signature } });

    const w = await runTrip(t, c.token, d.token, { paymentMethod: 'WALLET' });
    const fare = Number(w.fare);
    expect(w.payment.status).toBe('PAID');
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(500000 - fare);
    expect(Number((await t.call('get', '/wallet/me', { token: d.token })).balance)).toBe(Math.round(fare * 0.8));

    const cash = await runTrip(t, c.token, d.token);
    expect(cash.payment.status).toBe('PENDING');
    expect(Number((await t.call('get', '/wallet/me', { token: d.token })).balance)).toBe(Math.round(fare * 0.8) - Math.round(Number(cash.fare) * 0.2));
    expect((await t.call('post', `/wallet/trips/${cash.id}/confirm-cash`, { token: d.token })).status).toBe('PAID');

    const poor = await t.register('CUSTOMER', 'Poor');
    const fb = await runTrip(t, poor.token, d.token, { paymentMethod: 'WALLET' });
    expect(fb.paymentMethod).toBe('CASH');
    expect(fb.payment.status).toBe('PENDING');
  });

  it('withdrawal holds funds, is approved and paid by admin, and rejects double requests', async () => {
    const c = await t.register('CUSTOMER');
    const d = await t.driverOnDuty();
    const admin = await t.admin();
    const top = await t.call('post', '/wallet/topup', { token: c.token, body: { amount: 500000, gateway: 'mock' } });
    const { signature } = await t.call('post', '/wallet/topup/mock-sign', { token: c.token, body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G3' } });
    await t.call('post', '/wallet/topup/callback', { body: { txId: top.txId, result: 'SUCCESS', gatewayRef: 'G3', signature } });
    await runTrip(t, c.token, d.token, { paymentMethod: 'WALLET' });
    const before = Number((await t.call('get', '/wallet/me', { token: d.token })).balance);
    const w = await t.call('post', '/wallet/withdrawals', { token: d.token, body: { amount: 50000, bankName: 'VCB', bankAccount: '0011' } });
    expect(Number((await t.call('get', '/wallet/me', { token: d.token })).balance)).toBe(before - 50000);
    await expectStatus(t.call('post', '/wallet/withdrawals', { token: d.token, body: { amount: 50000, bankName: 'VCB', bankAccount: '0011' } }), 400);
    await t.call('patch', `/wallet/withdrawals/${w.id}`, { token: admin.token, body: { status: 'APPROVED' } });
    expect((await t.call('patch', `/wallet/withdrawals/${w.id}`, { token: admin.token, body: { status: 'PAID' } })).status).toBe('PAID');
    await expectStatus(t.call('patch', `/wallet/withdrawals/${w.id}`, { token: admin.token, body: { status: 'REJECTED' } }), 400);
  });

  it('VNPay IPN verifies checksum and amount, credits once, reports return', async () => {
    const c = await t.register('CUSTOMER');
    const top = await t.call('post', '/wallet/topup', { token: c.token, body: { amount: 150000, gateway: 'vnpay' } });
    expect(new URL(top.paymentUrl).host).toBe('sandbox.vnpayment.vn');
    const enc = (v: string) => encodeURIComponent(v).replace(/%20/g, '+');
    const sign = (p: Record<string, string>) =>
      createHmac('sha512', 'TESTSECRET0123456789')
        .update(Object.keys(p).filter((k) => k !== 'vnp_SecureHash').sort().map((k) => `${enc(k)}=${enc(p[k])}`).join('&'))
        .digest('hex');
    const base = { vnp_Amount: '15000000', vnp_BankCode: 'NCB', vnp_ResponseCode: '00', vnp_TmnCode: 'TESTCODE', vnp_TransactionNo: '1', vnp_TransactionStatus: '00', vnp_TxnRef: top.txId, vnp_PayDate: '20260929120000' };
    const q = (p: Record<string, string>) => new URLSearchParams({ ...p, vnp_SecureHash: sign(p) }).toString();
    expect((await t.call('get', `/wallet/vnpay/ipn?${new URLSearchParams({ ...base, vnp_SecureHash: 'ff' })}`)).RspCode).toBe('97');
    expect((await t.call('get', `/wallet/vnpay/ipn?${q({ ...base, vnp_Amount: '100' })}`)).RspCode).toBe('04');
    expect((await t.call('get', `/wallet/vnpay/ipn?${q({ ...base, vnp_TxnRef: 'nope' })}`)).RspCode).toBe('01');
    expect((await t.call('get', `/wallet/vnpay/ipn?${q(base)}`)).RspCode).toBe('00');
    expect((await t.call('get', `/wallet/vnpay/ipn?${q(base)}`)).RspCode).toBe('02');
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(150000);
    const ret = await t.call('get', `/wallet/vnpay/return?${q(base)}`);
    expect(ret.ok).toBe(true);
  });

  it('MoMo IPN verifies signature, credits once, records failures', async () => {
    const c = await t.register('CUSTOMER');
    // MoMo create is unreachable in tests → use a mock top-up as the pending order
    const top = await t.call('post', '/wallet/topup', { token: c.token, body: { amount: 50000, gateway: 'mock' } });
    const p = { partnerCode: 'MOMO', orderId: top.txId, requestId: top.txId, amount: 50000, orderInfo: 'Nap vi', orderType: 'momo_wallet', transId: 1, resultCode: 0, message: 'Successful.', payType: 'qr', responseTime: 1, extraData: '' };
    const raw = (x: typeof p) => `accessKey=F8BBA842ECF85&amount=${x.amount}&extraData=${x.extraData}&message=${x.message}&orderId=${x.orderId}&orderInfo=${x.orderInfo}&orderType=${x.orderType}&partnerCode=${x.partnerCode}&payType=${x.payType}&requestId=${x.requestId}&responseTime=${x.responseTime}&resultCode=${x.resultCode}&transId=${x.transId}`;
    const signed = (x: typeof p) => ({ ...x, signature: createHmac('sha256', 'K951B6PE1waDMi640xX08PD3vg6EkVlz').update(raw(x)).digest('hex') });
    await t.http().post('/api/wallet/momo/ipn').send({ ...signed(p), signature: 'x' }).expect(204);
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(0);
    await t.http().post('/api/wallet/momo/ipn').send(signed(p)).expect(204);
    await t.http().post('/api/wallet/momo/ipn').send(signed(p)).expect(204);
    expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(50000);
  });

  it('prices trips from the zone rule with promo codes and charges a late-cancellation fee', async () => {
    const admin = await t.admin();
    const c = await t.register('CUSTOMER', 'Promo');
    const d = await t.driverOnDuty('PriceDrv');
    const round = (n: number, unit: number) => Math.round(n / unit) * unit;

    // Global rule: 10k base + 10k/km, min 15k, rounded to 1000, surge off, 5k late-cancel fee.
    const rule = await t.call('post', '/admin/pricing/rules', {
      token: admin.token,
      body: { name: 'E2E', baseFare: 10000, perKm: 10000, minFare: 15000, roundTo: 1000, surgeEnabled: false, cancellationFee: 5000, sharedDiscountPct: 25 },
    });
    await expectStatus(t.call('post', '/admin/pricing/rules', { token: admin.token, body: { baseFare: 1000 } }), 400);
    try {
      const q = await t.call('get', `/pricing/quote?fromLat=${HCM.benThanh.lat}&fromLng=${HCM.benThanh.lng}&toLat=${HCM.tanDinh.lat}&toLng=${HCM.tanDinh.lng}`, { token: c.token });
      const expected = round(Math.max(15000, 10000 + Math.round((q.route.distanceMeters / 1000) * 10000)), 1000);
      expect(q.ruleName).toBe('E2E');
      expect(q.surgeMultiplier).toBe(1);
      expect(q.subtotal).toBe(Math.max(15000, 10000 + Math.round((q.route.distanceMeters / 1000) * 10000)));
      expect(q.total).toBe(expected);
      expect(q.promo).toBeNull();
      const shared = await t.call('get', `/pricing/quote?tripType=SHARED&fromLat=${HCM.benThanh.lat}&fromLng=${HCM.benThanh.lng}&toLat=${HCM.tanDinh.lat}&toLng=${HCM.tanDinh.lng}`, { token: c.token });
      expect(shared.breakdown.sharedDiscount).toBe(Math.round(q.subtotal * 0.25));

      // Promotion: 20% up to 10k, once per user.
      const promo = await t.call('post', '/admin/promotions', { token: admin.token, body: { code: 'hello20', type: 'PERCENT', value: 20, maxDiscount: 10000, perUserLimit: 1 } });
      expect(promo.code).toBe('HELLO20');
      await expectStatus(t.call('post', '/admin/promotions', { token: admin.token, body: { code: 'HELLO20', type: 'PERCENT', value: 5 } }), 400);
      const qp = await t.call('get', `/pricing/quote?promoCode=hello20&fromLat=${HCM.benThanh.lat}&fromLng=${HCM.benThanh.lng}&toLat=${HCM.tanDinh.lat}&toLng=${HCM.tanDinh.lng}`, { token: c.token });
      const discount = Math.min(10000, Math.round(q.subtotal * 0.2));
      expect(qp.promo.valid).toBe(true);
      expect(qp.discount).toBe(discount);
      expect(qp.total).toBe(round(q.subtotal - discount, 1000));
      const bad = await t.call('get', `/pricing/quote?promoCode=NOPE&fromLat=${HCM.benThanh.lat}&fromLng=${HCM.benThanh.lng}&toLat=${HCM.tanDinh.lat}&toLng=${HCM.tanDinh.lng}`, { token: c.token });
      expect(bad.promo.valid).toBe(false);

      // Booking applies the same numbers and records the redemption; a second use is refused.
      const trip = await t.call('post', '/trips', { token: c.token, body: { ...tripBody(HCM.benThanh, HCM.tanDinh), promoCode: 'hello20' } });
      expect(trip.promoCode).toBe('HELLO20');
      expect(trip.discountAmount).toBe(discount);
      expect(Number(trip.fare)).toBe(qp.total);
      expect(trip.fareBreakdown.ruleName).toBe('E2E');
      await expectStatus(t.call('post', '/trips', { token: c.token, body: { ...tripBody(HCM.benThanh, HCM.tanDinh), promoCode: 'HELLO20' } }), 400, 'khuyến mãi');
      await expectStatus(t.call('post', '/trips', { token: c.token, body: { ...tripBody(HCM.benThanh, HCM.tanDinh), promoCode: 'NOPE' } }), 400);
      expect(await t.call('get', `/admin/promotions/${promo.id}/redemptions`, { token: admin.token })).toHaveLength(1);
      expect((await t.call('get', '/admin/promotions', { token: admin.token })).find((p: any) => p.id === promo.id).usedCount).toBe(1);

      // Cancelling before any driver accepted is free and gives the promo back.
      await t.call('post', `/trips/${trip.id}/cancel`, { token: c.token });
      expect(await t.call('get', `/admin/promotions/${promo.id}/redemptions`, { token: admin.token })).toHaveLength(0);
      expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(0);

      // Cancelling after the driver accepted costs the rule's fee: customer −5000, driver +4000 (20% commission).
      const late = await t.call('post', '/trips', { token: c.token, body: tripBody(HCM.benThanh, HCM.tanDinh) });
      await t.call('post', `/trips/${late.id}/accept`, { token: d.token });
      const driverBefore = Number((await t.call('get', '/wallet/me', { token: d.token })).balance);
      await t.call('post', `/trips/${late.id}/cancel`, { token: c.token });
      expect(Number((await t.call('get', '/wallet/me', { token: c.token })).balance)).toBe(-5000);
      expect(Number((await t.call('get', '/wallet/me', { token: d.token })).balance)).toBe(driverBefore + 4000);

      const surge = await t.call('get', '/admin/pricing/surge', { token: admin.token });
      expect(surge[0].surgeEnabled).toBe(false);
      await t.call('patch', `/admin/promotions/${promo.id}`, { token: admin.token, body: { isActive: false } });
    } finally {
      // Leave later spec files on the built-in defaults.
      await t.call('delete', `/admin/pricing/rules/${rule.id}`, { token: admin.token });
    }
  });
});
