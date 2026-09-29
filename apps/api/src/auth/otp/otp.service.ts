import { BadRequestException, HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

class TooManyRequestsException extends HttpException {
  constructor(message: string) {
    super(message, HttpStatus.TOO_MANY_REQUESTS);
  }
}
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt, timingSafeEqual } from 'node:crypto';
import { RedisService } from '../../redis/redis.service.js';
import { SmsService } from '../../sms/sms.service.js';
import { normalizeVnPhone } from '../../common/phone.util.js';

export type OtpPurpose = 'REGISTER' | 'RESET_PASSWORD';

const OTP_TTL_SECS = 300;
const RESEND_COOLDOWN_SECS = 60;
const MAX_SENDS_PER_WINDOW = 5;
const SEND_WINDOW_SECS = 3600;
const MAX_VERIFY_ATTEMPTS = 5;
const VERIFIED_TOKEN_TTL = '10m';

/**
 * One-time codes for phone verification.
 *
 * Storage (Redis, all keys expire):
 *   otp:{purpose}:{phone}          → sha256(code) + attempts, TTL 5 min
 *   otp:cooldown:{purpose}:{phone} → resend lock 60 s
 *   otp:sends:{phone}              → sends in the last hour (max 5)
 *
 * A verified code yields a short-lived JWT bound to phone + purpose that the
 * register / reset-password endpoints require.
 */
@Injectable()
export class OtpService {
  private readonly logger = new Logger(OtpService.name);
  readonly required: boolean;
  private readonly devEcho: boolean;

  constructor(
    private redis: RedisService,
    private sms: SmsService,
    private jwt: JwtService,
    config: ConfigService,
  ) {
    this.required = (config.get<string>('OTP_REQUIRED') ?? 'true') !== 'false';
    // Console provider outside production: return the code in the API response so flows are testable.
    this.devEcho = process.env.NODE_ENV !== 'production' && this.sms.providerName === 'console';
  }

  private key(purpose: OtpPurpose, phone: string) {
    return `otp:${purpose}:${phone}`;
  }

  private hash(code: string, phone: string) {
    return createHash('sha256').update(`${phone}|${code}`).digest('hex');
  }

  async send(rawPhone: string, purpose: OtpPurpose) {
    const phone = normalizeVnPhone(rawPhone);
    if (!phone) throw new BadRequestException('Số điện thoại không hợp lệ');

    const cooldownKey = `otp:cooldown:${purpose}:${phone}`;
    if (await this.redis.client.exists(cooldownKey)) {
      const ttl = await this.redis.client.ttl(cooldownKey);
      throw new TooManyRequestsException(`Vui lòng đợi ${Math.max(ttl, 1)} giây trước khi gửi lại mã`);
    }
    const sendsKey = `otp:sends:${phone}`;
    const sends = await this.redis.client.incr(sendsKey);
    if (sends === 1) await this.redis.client.expire(sendsKey, SEND_WINDOW_SECS);
    if (sends > MAX_SENDS_PER_WINDOW) {
      throw new TooManyRequestsException('Bạn đã yêu cầu quá nhiều mã, thử lại sau 1 giờ');
    }

    const code = randomInt(0, 1_000_000).toString().padStart(6, '0');
    await this.redis.client
      .multi()
      .hset(this.key(purpose, phone), { hash: this.hash(code, phone), attempts: 0 })
      .expire(this.key(purpose, phone), OTP_TTL_SECS)
      .set(cooldownKey, '1', 'EX', RESEND_COOLDOWN_SECS)
      .exec();

    const label = purpose === 'REGISTER' ? 'dang ky' : 'dat lai mat khau';
    try {
      await this.sms.send(phone, `GhepGo: ma ${label} cua ban la ${code}. Ma co hieu luc 5 phut. Khong chia se ma nay.`);
    } catch (err) {
      this.logger.error(`SMS to ${phone} failed: ${(err as Error).message}`);
      await this.redis.client.del(this.key(purpose, phone), cooldownKey);
      throw new BadRequestException('Không gửi được tin nhắn, vui lòng thử lại');
    }

    return {
      phone,
      expiresInSecs: OTP_TTL_SECS,
      resendAfterSecs: RESEND_COOLDOWN_SECS,
      ...(this.devEcho ? { devCode: code } : {}),
    };
  }

  /** Returns a verification token on success; consumes the code. */
  async verify(rawPhone: string, code: string, purpose: OtpPurpose) {
    const phone = normalizeVnPhone(rawPhone);
    if (!phone) throw new BadRequestException('Số điện thoại không hợp lệ');
    const key = this.key(purpose, phone);
    const stored = await this.redis.client.hgetall(key);
    if (!stored?.hash) throw new BadRequestException('Mã đã hết hạn hoặc chưa được gửi');

    const attempts = await this.redis.client.hincrby(key, 'attempts', 1);
    if (attempts > MAX_VERIFY_ATTEMPTS) {
      await this.redis.client.del(key);
      throw new BadRequestException('Nhập sai quá nhiều lần, vui lòng yêu cầu mã mới');
    }

    const a = Buffer.from(this.hash(code.trim(), phone));
    const b = Buffer.from(stored.hash);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      throw new BadRequestException(`Mã không đúng (còn ${MAX_VERIFY_ATTEMPTS - attempts} lần thử)`);
    }

    await this.redis.client.del(key);
    const verificationToken = this.jwt.sign({ sub: phone, purpose, kind: 'otp' }, { expiresIn: VERIFIED_TOKEN_TTL });
    return { phone, verificationToken };
  }

  /** Throws unless `token` proves `phone` was verified for `purpose`. */
  assertVerified(token: string | undefined, rawPhone: string, purpose: OtpPurpose) {
    const phone = normalizeVnPhone(rawPhone);
    if (!phone) throw new BadRequestException('Số điện thoại không hợp lệ');
    if (!token) throw new BadRequestException('Cần xác thực số điện thoại bằng mã OTP');
    try {
      const payload = this.jwt.verify<{ sub: string; purpose: string; kind: string }>(token);
      if (payload.kind !== 'otp' || payload.purpose !== purpose || payload.sub !== phone) {
        throw new Error('mismatch');
      }
    } catch {
      throw new BadRequestException('Xác thực OTP không hợp lệ hoặc đã hết hạn, vui lòng gửi lại mã');
    }
    return phone;
  }
}
