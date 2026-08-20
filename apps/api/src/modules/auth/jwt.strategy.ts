import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { UsersService } from '../users/users.service';

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
  constructor(
    config: ConfigService,
    private readonly usersService: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromExtractors([
        cookieExtractor,
        ExtractJwt.fromAuthHeaderAsBearerToken(),
      ]),
      ignoreExpiration: false,
      secretOrKey: config.get('JWT_SECRET'),
    });
  }

  // Lectura fresca por request: la resolución de allowedWorkshopIds/role NUNCA
  // viaja como claim del JWT, así una revocación de acceso o desactivación
  // del usuario aplica de inmediato en el siguiente request, sin esperar
  // a que expire el token (hasta 8h).
  async validate(payload: { sub: string; email: string; role: string; permissions?: any }) {
    const ctx = await this.usersService.findAccessContext(payload.sub);
    if (!ctx || !ctx.active) {
      throw new UnauthorizedException('Sesión inválida');
    }

    return {
      id: ctx.id,
      email: payload.email,
      role: ctx.role, // la DB manda sobre el claim del JWT
      permissions: payload.permissions, // sin cambios, gap conocido y aceptado
      allowedWorkshopIds: ctx.allowedWorkshopIds,
    };
  }
}
