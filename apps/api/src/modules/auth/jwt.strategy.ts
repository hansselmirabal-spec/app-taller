import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';

// Extractor: cookie auth_token primero, fallback a Authorization header.
// El header se mantiene por back-compat con curl/scripts/CI; el frontend usa cookie.
const cookieExtractor = (req: Request): string | null => {
  const cookies = (req as any)?.cookies;
  if (cookies && typeof cookies === 'object' && typeof cookies.auth_token === 'string') {
    return cookies.auth_token;
  }
  return null;
};

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(config: ConfigService) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  async validate(payload: { sub: string; email: string; role: string; permissions?: any }) {
    return {
      id: payload.sub,
      email: payload.email,
      role: payload.role,
      permissions: payload.permissions,
    };
  }
}
