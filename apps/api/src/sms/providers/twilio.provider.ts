import type { SmsProvider } from '../sms.provider.js';

/** Twilio Programmable SMS via the REST API (no SDK dependency). */
export class TwilioProvider implements SmsProvider {
  readonly name = 'twilio';

  constructor(
    private accountSid: string,
    private authToken: string,
    private from: string,
  ) {}

  async send(phone: string, message: string) {
    const body = new URLSearchParams({ To: phone, From: this.from, Body: message });
    const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${this.accountSid}/Messages.json`, {
      method: 'POST',
      headers: {
        Authorization: `Basic ${Buffer.from(`${this.accountSid}:${this.authToken}`).toString('base64')}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`Twilio ${res.status}: ${data.message ?? 'send failed'}`);
    }
  }
}
