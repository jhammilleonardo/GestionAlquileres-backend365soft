import { ForbiddenException, Injectable, NestMiddleware } from '@nestjs/common';
import { timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  CSRF_HEADER,
  REFRESH_TOKEN_COOKIE,
} from './auth-cookie.util';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Protección CSRF por double-submit token. Solo se exige en mutaciones
 * autenticadas **por cookie**: si la request trae `Authorization: Bearer` el
 * token no viaja automáticamente cross-site (no es vulnerable a CSRF), y si no
 * hay sesión por cookie son otros guards los que deciden. Así el frontend
 * actual basado en header no se ve afectado durante la migración.
 */
@Injectable()
export class CsrfMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction): void {
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return next();
    }

    const authHeader = req.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return next();
    }

    const cookies = (req as { cookies?: Record<string, string> }).cookies;
    if (!cookies?.[ACCESS_TOKEN_COOKIE] && !cookies?.[REFRESH_TOKEN_COOKIE]) {
      // Sin sesión por cookie: la autorización la maneja el guard de la ruta.
      return next();
    }

    const cookieToken = cookies[CSRF_COOKIE];
    const headerToken = req.headers[CSRF_HEADER];
    if (!this.tokensMatch(cookieToken, headerToken)) {
      throw new ForbiddenException('Token CSRF inválido o ausente');
    }

    next();
  }

  private tokensMatch(
    cookieToken: string | undefined,
    headerToken: unknown,
  ): boolean {
    if (!cookieToken || typeof headerToken !== 'string') {
      return false;
    }

    const cookieBuffer = Buffer.from(cookieToken);
    const headerBuffer = Buffer.from(headerToken);
    return (
      cookieBuffer.length === headerBuffer.length &&
      timingSafeEqual(cookieBuffer, headerBuffer)
    );
  }
}
