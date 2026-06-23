import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { Response } from 'express';
import { Observable, from, mergeMap } from 'rxjs';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
  authCookieOptions,
  csrfCookieOptions,
  generateCsrfToken,
  refreshCookieOptions,
} from './auth-cookie.util';
import { RefreshTokenService } from './refresh-token.service';

interface AuthResponseBody {
  access_token?: string;
}

interface DecodedJwt {
  sub?: number;
  email?: string;
  role?: string;
  tenantSlug?: string;
  rentalOwnerId?: number | null;
  vendorId?: number | null;
  mfaVerified?: boolean;
  tokenVersion?: number;
}

/**
 * Cuando una respuesta de autenticación incluye `access_token`, lo replica como
 * cookie HttpOnly y emite además un refresh token (cookie HttpOnly aparte).
 * El JWT se elimina del body antes de responder al navegador: sólo queda en la
 * cookie HttpOnly. `AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE=true` existe únicamente
 * para clientes de integración legacy y no debe habilitarse en producción.
 */
@Injectable()
export class AuthCookieInterceptor implements NestInterceptor {
  constructor(
    private readonly jwtService: JwtService,
    private readonly refreshTokenService: RefreshTokenService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const res = context.switchToHttp().getResponse<Response>();
    return next
      .handle()
      .pipe(mergeMap((body: unknown) => from(this.attachCookies(body, res))));
  }

  private async attachCookies(body: unknown, res: Response): Promise<unknown> {
    const token = (body as AuthResponseBody | null)?.access_token;
    if (!token) {
      return body;
    }

    res.cookie(ACCESS_TOKEN_COOKIE, token, authCookieOptions());
    // Token CSRF fresco para el patrón double-submit (cookie legible por JS).
    res.cookie(CSRF_COOKIE, generateCsrfToken(), csrfCookieOptions());

    const decoded: DecodedJwt | null = this.jwtService.decode(token);
    if (decoded?.sub && decoded.email && decoded.role && decoded.tenantSlug) {
      const refresh = await this.refreshTokenService.issue({
        sub: decoded.sub,
        email: decoded.email,
        role: decoded.role,
        tenantSlug: decoded.tenantSlug,
        rentalOwnerId: decoded.rentalOwnerId ?? null,
        vendorId: decoded.vendorId ?? null,
        mfaVerified: decoded.mfaVerified ?? false,
        tokenVersion: decoded.tokenVersion ?? 0,
      });
      res.cookie(REFRESH_TOKEN_COOKIE, refresh, refreshCookieOptions());
    }

    if (this.exposeAccessTokenInResponse()) {
      return body;
    }

    const { access_token: _token, ...publicBody } = body as Record<
      string,
      unknown
    >;
    void _token;
    return publicBody;
  }

  private exposeAccessTokenInResponse(): boolean {
    if (process.env.NODE_ENV === 'production') {
      return false;
    }

    return (
      (process.env.AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE ?? '').toLowerCase() ===
      'true'
    );
  }
}
