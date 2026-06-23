import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import type { Request } from 'express';
import { AuthRequestUser } from '../auth.service';
import { extractAccessToken } from '../auth-cookie.util';
import type { TenantRequest } from '../../common/middleware/tenant-context.middleware';

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  tenantSlug: string;
  rentalOwnerId?: number | null;
  vendorId?: number | null;
  mfaVerified?: boolean;
  mfaAt?: number | null;
  tokenVersion?: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private configService: ConfigService) {
    const jwtSecret = configService.get<string>('JWT_SECRET');

    if (!jwtSecret || jwtSecret.length < 32) {
      throw new Error(
        'JWT_SECRET must be configured and have at least 32 characters. ' +
          "Generate one with: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\"",
      );
    }

    super({
      // Acepta el token por cookie HttpOnly o por header Authorization (este
      // último para compatibilidad durante la migración a cookies).
      jwtFromRequest: ExtractJwt.fromExtractors([
        (req: Request) => extractAccessToken(req),
      ]),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
      passReqToCallback: true,
    });
  }

  validate(req: TenantRequest, payload: JwtPayload): AuthRequestUser {
    if (req.tenant && payload.tenantSlug !== req.tenant.slug) {
      throw new UnauthorizedException('Token not valid for requested company');
    }

    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantSlug: payload.tenantSlug,
      rentalOwnerId: payload.rentalOwnerId ?? null,
      vendorId: payload.vendorId ?? null,
      mfaVerified: payload.mfaVerified ?? false,
      mfaAt: payload.mfaAt ?? null,
      tokenVersion: payload.tokenVersion,
    };
  }
}
