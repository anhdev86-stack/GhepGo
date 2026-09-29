import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * VNPay payment gateway (v2.1.0) — https://sandbox.vnpayment.vn/apis/docs/
 *
 * Signature rules (both directions):
 *  - take every vnp_* param except vnp_SecureHash / vnp_SecureHashType
 *  - sort keys ascending, URL-encode keys and values (encodeURIComponent, space → '+')
 *  - join as k=v&k=v and HMAC-SHA512 with the merchant hash secret
 */
export interface VnpayBuildInput {
  txnRef: string;
  amountVnd: number;
  orderInfo: string;
  ipAddr: string;
  returnUrl: string;
  locale?: 'vn' | 'en';
  bankCode?: string;
}

export interface VnpayCallbackParams {
  [key: string]: string | undefined;
  vnp_TxnRef?: string;
  vnp_Amount?: string;
  vnp_ResponseCode?: string;
  vnp_TransactionStatus?: string;
  vnp_TransactionNo?: string;
  vnp_BankCode?: string;
  vnp_PayDate?: string;
  vnp_SecureHash?: string;
}

export const VNPAY_RSP = {
  OK: { RspCode: '00', Message: 'Confirm Success' },
  NOT_FOUND: { RspCode: '01', Message: 'Order not found' },
  ALREADY_CONFIRMED: { RspCode: '02', Message: 'Order already confirmed' },
  INVALID_AMOUNT: { RspCode: '04', Message: 'Invalid amount' },
  INVALID_CHECKSUM: { RspCode: '97', Message: 'Invalid checksum' },
  ERROR: { RspCode: '99', Message: 'Unknown error' },
} as const;

function encode(value: string) {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/** yyyyMMddHHmmss in Asia/Ho_Chi_Minh (VNPay requires GMT+7). */
export function vnpayTimestamp(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}${get('hour')}${get('minute')}${get('second')}`;
}

@Injectable()
export class VnpayService {
  private readonly logger = new Logger(VnpayService.name);
  readonly tmnCode: string;
  private readonly hashSecret: string;
  readonly payUrl: string;
  readonly expireMinutes: number;

  constructor(config: ConfigService) {
    this.tmnCode = config.get<string>('VNPAY_TMN_CODE') ?? '';
    this.hashSecret = config.get<string>('VNPAY_HASH_SECRET') ?? '';
    this.payUrl = config.get<string>('VNPAY_URL') ?? 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html';
    this.expireMinutes = Number(config.get('VNPAY_EXPIRE_MINUTES') ?? 15);
  }

  get configured() {
    return !!this.tmnCode && !!this.hashSecret;
  }

  /** Canonical query string used for signing (sorted, encoded, without the hash itself). */
  signData(params: Record<string, string | number | undefined>) {
    return Object.keys(params)
      .filter((k) => k !== 'vnp_SecureHash' && k !== 'vnp_SecureHashType' && params[k] !== undefined && params[k] !== '')
      .sort()
      .map((k) => `${encode(k)}=${encode(String(params[k]))}`)
      .join('&');
  }

  sign(data: string) {
    return createHmac('sha512', this.hashSecret).update(Buffer.from(data, 'utf8')).digest('hex');
  }

  buildPaymentUrl(input: VnpayBuildInput, now = new Date()) {
    const expire = new Date(now.getTime() + this.expireMinutes * 60_000);
    const params: Record<string, string | number> = {
      vnp_Version: '2.1.0',
      vnp_Command: 'pay',
      vnp_TmnCode: this.tmnCode,
      vnp_Amount: Math.round(input.amountVnd) * 100, // VNPay expects amount × 100
      vnp_CreateDate: vnpayTimestamp(now),
      vnp_ExpireDate: vnpayTimestamp(expire),
      vnp_CurrCode: 'VND',
      vnp_IpAddr: input.ipAddr,
      vnp_Locale: input.locale ?? 'vn',
      vnp_OrderInfo: input.orderInfo,
      vnp_OrderType: 'other',
      vnp_ReturnUrl: input.returnUrl,
      vnp_TxnRef: input.txnRef,
    };
    if (input.bankCode) params.vnp_BankCode = input.bankCode;
    const data = this.signData(params);
    return `${this.payUrl}?${data}&vnp_SecureHash=${this.sign(data)}`;
  }

  /** Verify vnp_SecureHash on IPN / return-URL params. */
  verify(params: VnpayCallbackParams): boolean {
    const received = params.vnp_SecureHash ?? '';
    if (!received) return false;
    const expected = this.sign(this.signData(params));
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received.toLowerCase(), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  /** Both codes must be "00" for a successful payment. */
  isSuccess(params: VnpayCallbackParams) {
    return params.vnp_ResponseCode === '00' && params.vnp_TransactionStatus === '00';
  }

  /** Amount in VND (VNPay sends amount × 100). */
  amountVnd(params: VnpayCallbackParams) {
    return Math.round(Number(params.vnp_Amount ?? 0) / 100);
  }
}
