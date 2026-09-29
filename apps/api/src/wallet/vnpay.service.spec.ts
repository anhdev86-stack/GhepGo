import { ConfigService } from '@nestjs/config';
import { VnpayService, vnpayTimestamp } from './vnpay.service.js';

const config = new ConfigService({
  VNPAY_TMN_CODE: 'DEMOV210',
  VNPAY_HASH_SECRET: 'RAOEXHYVSDDIIENYWSLDIIZTANXUXZFJ',
  VNPAY_URL: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html',
});

describe('VnpayService', () => {
  const svc = new VnpayService(config);

  it('formats timestamps as yyyyMMddHHmmss in GMT+7', () => {
    // 2026-09-29T03:04:05Z is 10:04:05 in Ho Chi Minh City
    expect(vnpayTimestamp(new Date('2026-09-29T03:04:05Z'))).toBe('20260929100405');
  });

  it('builds a signed payment URL with sorted, encoded params and amount ×100', () => {
    const url = svc.buildPaymentUrl(
      {
        txnRef: 'tx123',
        amountVnd: 100000,
        orderInfo: 'Nap vi GhepGo tx123',
        ipAddr: '127.0.0.1',
        returnUrl: 'http://localhost:3000/wallet/vnpay-return',
      },
      new Date('2026-09-29T03:04:05Z'),
    );
    const u = new URL(url);
    expect(u.origin + u.pathname).toBe('https://sandbox.vnpayment.vn/paymentv2/vpcpay.html');
    expect(u.searchParams.get('vnp_Amount')).toBe('10000000');
    expect(u.searchParams.get('vnp_TmnCode')).toBe('DEMOV210');
    expect(u.searchParams.get('vnp_CreateDate')).toBe('20260929100405');
    expect(u.searchParams.get('vnp_ExpireDate')).toBe('20260929101905');
    expect(u.searchParams.get('vnp_OrderInfo')).toBe('Nap vi GhepGo tx123');
    const keys = [...u.searchParams.keys()];
    expect(keys.at(-1)).toBe('vnp_SecureHash');
    expect([...keys.slice(0, -1)].sort()).toEqual(keys.slice(0, -1));
    expect(u.searchParams.get('vnp_SecureHash')).toMatch(/^[0-9a-f]{128}$/);
  });

  it('verifies a callback it signed itself and rejects tampering', () => {
    const params: Record<string, string> = {
      vnp_Amount: '10000000',
      vnp_BankCode: 'NCB',
      vnp_ResponseCode: '00',
      vnp_TmnCode: 'DEMOV210',
      vnp_TransactionNo: '14226112',
      vnp_TransactionStatus: '00',
      vnp_TxnRef: 'tx123',
      vnp_PayDate: '20260929100500',
    };
    const signed = { ...params, vnp_SecureHash: svc.sign(svc.signData(params)) };
    expect(svc.verify(signed)).toBe(true);
    expect(svc.verify({ ...signed, vnp_SecureHashType: 'SHA512' })).toBe(true);
    expect(svc.verify({ ...signed, vnp_Amount: '20000000' })).toBe(false);
    expect(svc.verify({ ...signed, vnp_SecureHash: 'deadbeef' })).toBe(false);
    expect(svc.verify({ ...params })).toBe(false);
    expect(svc.isSuccess(signed)).toBe(true);
    expect(svc.isSuccess({ ...signed, vnp_ResponseCode: '24' })).toBe(false);
    expect(svc.amountVnd(signed)).toBe(100000);
  });

  it('reports not configured without credentials', () => {
    expect(new VnpayService(new ConfigService({})).configured).toBe(false);
  });
});
