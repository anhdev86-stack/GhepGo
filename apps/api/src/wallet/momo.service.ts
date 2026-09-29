import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * MoMo Payment API v2 (captureWallet) — https://developers.momo.vn/v3/docs/payment/api/wallet/onetime
 *
 *  create:  POST {endpoint}/v2/gateway/api/create, signature = HMAC-SHA256 over the
 *           alphabetically ordered raw string of selected fields, using secretKey.
 *  IPN:     MoMo POSTs JSON to ipnUrl; verify `signature` the same way; reply HTTP 204.
 *  redirect: same fields arrive as query params on redirectUrl.
 */
export interface MomoCreateInput {
  orderId: string;
  requestId: string;
  amountVnd: number;
  orderInfo: string;
  redirectUrl: string;
  ipnUrl: string;
  extraData?: string;
}

export interface MomoCallbackParams {
  [key: string]: string | number | undefined;
  partnerCode?: string;
  orderId?: string;
  requestId?: string;
  amount?: string | number;
  orderInfo?: string;
  orderType?: string;
  transId?: string | number;
  resultCode?: string | number;
  message?: string;
  payType?: string;
  responseTime?: string | number;
  extraData?: string;
  signature?: string;
}

const CALLBACK_SIGNED_FIELDS = [
  'amount',
  'extraData',
  'message',
  'orderId',
  'orderInfo',
  'orderType',
  'partnerCode',
  'payType',
  'requestId',
  'responseTime',
  'resultCode',
  'transId',
] as const;

@Injectable()
export class MomoService {
  private readonly logger = new Logger(MomoService.name);
  readonly partnerCode: string;
  private readonly accessKey: string;
  private readonly secretKey: string;
  readonly endpoint: string;

  constructor(config: ConfigService) {
    this.partnerCode = config.get<string>('MOMO_PARTNER_CODE') ?? '';
    this.accessKey = config.get<string>('MOMO_ACCESS_KEY') ?? '';
    this.secretKey = config.get<string>('MOMO_SECRET_KEY') ?? '';
    this.endpoint = config.get<string>('MOMO_ENDPOINT') ?? 'https://test-payment.momo.vn';
  }

  get configured() {
    return !!this.partnerCode && !!this.accessKey && !!this.secretKey;
  }

  sign(raw: string) {
    return createHmac('sha256', this.secretKey).update(raw, 'utf8').digest('hex');
  }

  createRawSignature(input: MomoCreateInput) {
    return (
      `accessKey=${this.accessKey}&amount=${Math.round(input.amountVnd)}&extraData=${input.extraData ?? ''}` +
      `&ipnUrl=${input.ipnUrl}&orderId=${input.orderId}&orderInfo=${input.orderInfo}&partnerCode=${this.partnerCode}` +
      `&redirectUrl=${input.redirectUrl}&requestId=${input.requestId}&requestType=captureWallet`
    );
  }

  buildCreateBody(input: MomoCreateInput) {
    return {
      partnerCode: this.partnerCode,
      partnerName: 'GhepGo',
      storeId: 'GhepGoWallet',
      requestId: input.requestId,
      amount: Math.round(input.amountVnd),
      orderId: input.orderId,
      orderInfo: input.orderInfo,
      redirectUrl: input.redirectUrl,
      ipnUrl: input.ipnUrl,
      lang: 'vi',
      requestType: 'captureWallet',
      autoCapture: true,
      extraData: input.extraData ?? '',
      signature: this.sign(this.createRawSignature(input)),
    };
  }

  /** Calls MoMo to create the payment; returns payUrl (web) and deeplink (app). */
  async createPayment(input: MomoCreateInput): Promise<{ payUrl: string; deeplink?: string; qrCodeUrl?: string }> {
    const res = await fetch(`${this.endpoint}/v2/gateway/api/create`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.buildCreateBody(input)),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as {
      resultCode?: number;
      message?: string;
      payUrl?: string;
      deeplink?: string;
      qrCodeUrl?: string;
    };
    if (!res.ok || data.resultCode !== 0 || !data.payUrl) {
      this.logger.warn(`MoMo create failed: HTTP ${res.status} ${data.resultCode} ${data.message}`);
      throw new Error(`MoMo: ${data.message ?? `HTTP ${res.status}`}`);
    }
    return { payUrl: data.payUrl, deeplink: data.deeplink, qrCodeUrl: data.qrCodeUrl };
  }

  callbackRawSignature(p: MomoCallbackParams) {
    return (
      `accessKey=${this.accessKey}&` +
      CALLBACK_SIGNED_FIELDS.map((k) => `${k}=${p[k] ?? ''}`).join('&')
    );
  }

  verify(p: MomoCallbackParams): boolean {
    const received = typeof p.signature === 'string' ? p.signature : '';
    if (!received) return false;
    if (p.partnerCode !== this.partnerCode) return false;
    const expected = this.sign(this.callbackRawSignature(p));
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(received.toLowerCase(), 'utf8');
    return a.length === b.length && timingSafeEqual(a, b);
  }

  isSuccess(p: MomoCallbackParams) {
    return Number(p.resultCode) === 0;
  }

  amountVnd(p: MomoCallbackParams) {
    return Math.round(Number(p.amount ?? 0));
  }
}
