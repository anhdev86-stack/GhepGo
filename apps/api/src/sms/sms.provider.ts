export interface SmsProvider {
  readonly name: string;
  /** Sends a text message; `phone` is E.164 (+84...). Throws on provider failure. */
  send(phone: string, message: string): Promise<void>;
}
