import type { SmsProvider } from '../sms.provider.js';

/**
 * eSMS.vn (https://esms.vn) — popular Vietnamese SMS brandname gateway.
 * SmsType 2 = brandname CSKH (needs an approved Brandname), 8 = brandname quảng cáo.
 */
export class EsmsProvider implements SmsProvider {
  readonly name = 'esms';

  constructor(
    private apiKey: string,
    private secretKey: string,
    private brandname: string,
    private smsType = '2',
  ) {}

  async send(phone: string, message: string) {
    const res = await fetch('https://rest.esms.vn/MainService.svc/json/SendMultipleMessage_V4_post_json/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ApiKey: this.apiKey,
        SecretKey: this.secretKey,
        Phone: phone.replace(/^\+/, ''),
        Content: message,
        SmsType: this.smsType,
        Brandname: this.brandname,
        IsUnicode: '0',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    const data = (await res.json().catch(() => ({}))) as { CodeResult?: string; ErrorMessage?: string };
    if (!res.ok || data.CodeResult !== '100') {
      throw new Error(`eSMS ${data.CodeResult ?? res.status}: ${data.ErrorMessage ?? 'send failed'}`);
    }
  }
}
