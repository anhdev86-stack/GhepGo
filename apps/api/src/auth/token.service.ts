import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { RedisService } from '../redis/redis.service.js';

export interface AccessPayload {
  sub: string;
  phone: string;
  role: string;
  jti: string;
  exp?: number;
}

const REFRESH_TTL_SECS = 30 * 86400;

/**
 * Access tokens are short-lived JWTs carrying a `jti`; logout puts the jti on a
 * Redis blocklist until it expires. Refresh tokens are opaque random strings
 * stored (hashed) in Redis with the user id; they rotate on every use and can
 * be revoked per token or for a whole user.
 */
@Injectable()
export class TokenService {
  readonly accessTtl: string;

  constructor(
    private jwt: JwtService,
    private redis: RedisService,
    config: ConfigService,
  ) {
    this.accessTtl = config.get<string>('JWT_EXPIRES_IN') ?? '1h';
  }

  private hash(t: string) {
    return createHash('sha256').update(t).digest('hex');
  }

  async issuePair(user: { id: string; phone: string; role: string }) {
    const jti = randomUUID();
    const accessToken = this.jwt.sign({ sub: user.id, phone: user.phone, role: user.role, jti }, { expiresIn: this.accessTtl as never });
    const refreshToken = randomBytes(48).toString('base64url');
    const key = `refresh:${this.hash(refreshToken)}`;
    await this.redis.client
      .multi()
      .set(key, user.id, 'EX', REFRESH_TTL_SECS)
      .sadd(`refresh:user:${user.id}`, key)
      .expire(`refresh:user:${user.id}`, REFRESH_TTL_SECS)
      .exec();
    return { accessToken, refreshToken };
  }

  /** Validates and consumes a refresh token; returns the user id. */
  async consumeRefresh(refreshToken: string): Promise<string> {
    const key = `refresh:${this.hash(refreshToken)}`;
    const userId = await this.redis.client.getdel(key);
    if (!userId) throw new UnauthorizedException('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại');
    await this.redis.client.srem(`refresh:user:${userId}`, key);
    return userId;
  }

  async revokeRefresh(refreshToken: string) {
    const key = `refresh:${this.hash(refreshToken)}`;
    const userId = await this.redis.client.getdel(key);
    if (userId) await this.redis.client.srem(`refresh:user:${userId}`, key);
  }

  /** Logs the user out everywhere (all refresh tokens). */
  async revokeAllRefresh(userId: string) {
    const setKey = `refresh:user:${userId}`;
    const keys = await this.redis.client.smembers(setKey);
    if (keys.length) await this.redis.client.del(...keys);
    await this.redis.client.del(setKey);
  }

  async blockAccess(payload: AccessPayload) {
    const ttl = payload.exp ? payload.exp - Math.floor(Date.now() / 1000) : 3600;
    if (ttl > 0) await this.redis.client.set(`jwt:block:${payload.jti}`, '1', 'EX', ttl);
  }

  async isBlocked(jti: string | undefined) {
    if (!jti) return false;
    return (await this.redis.client.exists(`jwt:block:${jti}`)) === 1;
  }
}
