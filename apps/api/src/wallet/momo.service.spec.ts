import { ConfigService } from '@nestjs/config';
import { MomoService } from './momo.service.js';

const config = new ConfigService({
  MOMO_PARTNER_CODE: 'MOMO',
  MOMO_ACCESS_KEY: 'F8BBA842ECF85',
  MOMO_SECRET_KEY: 'K951B6PE1waDMi640xX08PD3vg6EkVlz',
});

describe('MomoService', () => {
  const svc = new MomoService(config);
  const input = {
    orderId: 'order1',
    requestId: 'req1',
    amountVnd: 50000,
    orderInfo: 'Nap vi GhepGo',
    redirectUrl: 'http://localhost:3000/wallet/momo-return',
    ipnUrl: 'http://localhost:3001/api/wallet/momo/ipn',
  };

  it('builds the create raw signature in MoMo field order', () => {
    expect(svc.createRawSignature(input)).toBe(
      'accessKey=F8BBA842ECF85&amount=50000&extraData=&ipnUrl=http://localhost:3001/api/wallet/momo/ipn' +
        '&orderId=order1&orderInfo=Nap vi GhepGo&partnerCode=MOMO&redirectUrl=http://localhost:3000/wallet/momo-return' +
        '&requestId=req1&requestType=captureWallet',
    );
    const body = svc.buildCreateBody(input);
    expect(body.requestType).toBe('captureWallet');
    expect(body.amount).toBe(50000);
    expect(body.signature).toMatch(/^[0-9a-f]{64}$/);
  });

  it('verifies a callback it signed itself and rejects tampering', () => {
    const p = {
      partnerCode: 'MOMO',
      orderId: 'order1',
      requestId: 'req1',
      amount: 50000,
      orderInfo: 'Nap vi GhepGo',
      orderType: 'momo_wallet',
      transId: 2147483647,
      resultCode: 0,
      message: 'Successful.',
      payType: 'qr',
      responseTime: 1700000000000,
      extraData: '',
    };
    const signed = { ...p, signature: svc.sign(svc.callbackRawSignature(p)) };
    expect(svc.verify(signed)).toBe(true);
    // query-string form: every value is a string
    const asStrings = Object.fromEntries(Object.entries(signed).map(([k, v]) => [k, String(v)]));
    expect(svc.verify(asStrings)).toBe(true);
    expect(svc.verify({ ...signed, amount: 60000 })).toBe(false);
    expect(svc.verify({ ...signed, partnerCode: 'OTHER' })).toBe(false);
    expect(svc.verify({ ...signed, signature: 'x' })).toBe(false);
    expect(svc.isSuccess(signed)).toBe(true);
    expect(svc.isSuccess({ ...signed, resultCode: '1006' })).toBe(false);
    expect(svc.amountVnd(asStrings)).toBe(50000);
  });

  it('reports not configured without credentials', () => {
    expect(new MomoService(new ConfigService({})).configured).toBe(false);
  });
});
