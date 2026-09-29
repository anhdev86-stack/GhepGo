import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { SmsProvider } from './sms.provider.js';
import { ConsoleSmsProvider } from './providers/console.provider.js';
import { EsmsProvider } from './providers/esms.provider.js';
import { TwilioProvider } from './providers/twilio.provider.js';

@Injectable()
export class SmsService {
  private readonly logger = new Logger(SmsService.name);
  private readonly provider: SmsProvider;

  constructor(config: ConfigService) {
    const name = (config.get<string>('SMS_PROVIDER') ?? 'console').toLowerCase();
    if (name === 'esms' && config.get('ESMS_API_KEY') && config.get('ESMS_SECRET_KEY')) {
      this.provider = new EsmsProvider(
        config.get<string>('ESMS_API_KEY')!,
        config.get<string>('ESMS_SECRET_KEY')!,
        config.get<string>('ESMS_BRANDNAME') ?? 'GhepGo',
        config.get<string>('ESMS_SMS_TYPE') ?? '2',
      );
    } else if (name === 'twilio' && config.get('TWILIO_ACCOUNT_SID') && config.get('TWILIO_AUTH_TOKEN')) {
      this.provider = new TwilioProvider(
        config.get<string>('TWILIO_ACCOUNT_SID')!,
        config.get<string>('TWILIO_AUTH_TOKEN')!,
        config.get<string>('TWILIO_FROM') ?? '',
      );
    } else {
      if (name !== 'console') this.logger.warn(`SMS_PROVIDER=${name} missing credentials — using console`);
      this.provider = new ConsoleSmsProvider();
    }
    this.logger.log(`SMS provider: ${this.provider.name}`);
  }

  get providerName() {
    return this.provider.name;
  }

  send(phone: string, message: string) {
    return this.provider.send(phone, message);
  }
}
