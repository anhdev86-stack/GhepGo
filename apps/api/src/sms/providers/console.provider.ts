import { Logger } from '@nestjs/common';
import type { SmsProvider } from '../sms.provider.js';

/** Dev provider: prints the message to the API log instead of sending. */
export class ConsoleSmsProvider implements SmsProvider {
  readonly name = 'console';
  private readonly logger = new Logger('SMS');

  async send(phone: string, message: string) {
    this.logger.log(`→ ${phone}: ${message}`);
  }
}
