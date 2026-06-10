import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { ConfigService } from '@nestjs/config';
import { AuthRequestUser } from '../auth.service';

interface JwtPayload {
  sub: number;
  email: string;
  role: string;
  tenantSlug: string;
  rentalOwnerId?: number | null;
  vendorId?: number | null;
  mfaVerified?: boolean;
  mfaAt?: number | null;
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
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: jwtSecret,
    });
  }

  validate(payload: JwtPayload): AuthRequestUser {
    return {
      userId: payload.sub,
      email: payload.email,
      role: payload.role,
      tenantSlug: payload.tenantSlug,
      rentalOwnerId: payload.rentalOwnerId ?? null,
      vendorId: payload.vendorId ?? null,
      mfaVerified: payload.mfaVerified ?? false,
      mfaAt: payload.mfaAt ?? null,
    };
  }
}
