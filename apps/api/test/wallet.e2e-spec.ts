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
});
