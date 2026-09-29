import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { TokenService } from '../token.service.js';

export interface JwtPayload {
  sub: string;
  phone: string;
  role: string;
  jti?: string;
  exp?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService,
    private tokens: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.get<string>('JWT_SECRET') ?? 'change-me-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    if (await this.tokens.isBlocked(payload.jti)) throw new UnauthorizedException('Phiên đăng nhập đã kết thúc');
    return { userId: payload.sub, phone: payload.phone, role: payload.role, jti: payload.jti, exp: payload.exp };
  }
}
