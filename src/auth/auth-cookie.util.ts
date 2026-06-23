import type { CookieOptions } from 'express';
import type { Request } from 'express';
import { randomBytes } from 'crypto';

/** Nombre de la cookie HttpOnly que transporta el access token (JWT). */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Cookie del token CSRF (NO HttpOnly: el JS la lee para reenviarla en header). */
export const CSRF_COOKIE = 'csrf_token';

/** Header donde el cliente reenvía el token CSRF (patrón double-submit). */
export const CSRF_HEADER = 'x-csrf-token';

/** Nombre de la cookie HttpOnly que transporta el refresh token (opaco). */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/**
 * Extrae el access token con la misma prioridad en toda la aplicación.
 * La cookie es la fuente principal; Bearer se conserva para integraciones.
 */
export function extractAccessToken(req: Request): string | null {
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  const cookieToken = cookies?.[ACCESS_TOKEN_COOKIE];
  if (typeof cookieToken === 'string' && cookieToken.length > 0) {
    return cookieToken;
  }

  const authorization = req.headers.authorization;
  if (
    typeof authorization !== 'string' ||
    !authorization.startsWith('Bearer ')
  ) {
    return null;
  }

  const bearerToken = authorization.slice(7).trim();
  return bearerToken.length > 0 ? bearerToken : null;
}

/** Ruta a la que se acota la cookie de refresh (sólo rutas de auth). */
const REFRESH_COOKIE_PATH = '/auth';

const DEFAULT_ACCESS_TOKEN_TTL_MINUTES = 15;

/** Vida del refresh token en cookie (30d). */
const REFRESH_TOKEN_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Vida corta del access token. El límite superior evita que una variable de
 * entorno mal configurada convierta accidentalmente el access token en una
 * credencial de larga duración.
 */
export function accessTokenTtlSeconds(): number {
  const configured = Number(process.env.ACCESS_TOKEN_TTL_MINUTES);
  const minutes =
    Number.isFinite(configured) && configured >= 5 && configured <= 60
      ? configured
      : DEFAULT_ACCESS_TOKEN_TTL_MINUTES;

  return Math.floor(minutes * 60);
}

/**
 * Opciones de la cookie de sesión. HttpOnly evita el robo del token vía XSS
 * (no accesible desde JS); `secure` se activa en producción o detrás de un
 * proxy TLS; `sameSite=lax` mitiga CSRF en navegación cross-site manteniendo
 * el login same-site (frontend y API comparten dominio).
 */
export function authCookieOptions(): CookieOptions {
  const isProduction = process.env.NODE_ENV === 'production';
  const tlsByProxy =
    (process.env.TLS_TERMINATED_BY_PROXY ?? '').toLowerCase() === 'true';

  return {
    httpOnly: true,
    secure: isProduction || tlsByProxy,
    sameSite: 'lax',
    path: '/',
    maxAge: accessTokenTtlSeconds() * 1000,
  };
}

/**
 * Opciones de la cookie de refresh. Igual que la de acceso pero acotada a
 * `/auth` (sólo viaja a los endpoints de autenticación) y con vida más larga.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    ...authCookieOptions(),
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  };
}

/**
 * Opciones de la cookie CSRF: legible por JS (`httpOnly: false`) para el patrón
 * double-submit. No es secreta — su valor debe coincidir con el header que el
 * cliente reenvía; un atacante cross-site no puede leer la cookie ni fijar el
 * header, por eso protege contra CSRF.
 */
export function csrfCookieOptions(): CookieOptions {
  return {
    ...authCookieOptions(),
    httpOnly: false,
    // Debe sobrevivir al access token para poder proteger POST /auth/refresh.
    maxAge: REFRESH_TOKEN_MAX_AGE_MS,
  };
}

/** Genera un token CSRF aleatorio (hex de 32 bytes). */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex');
}
