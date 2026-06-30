import type { CookieOptions } from 'express';
import type { Request } from 'express';
import type { Response } from 'express';
import { randomBytes } from 'crypto';

export type AuthCookieContext = 'admin' | 'tenant' | 'owner' | 'vendor';

/** Nombre de la cookie HttpOnly que transporta el access token (JWT). */
export const ACCESS_TOKEN_COOKIE = 'access_token';

/** Cookie del token CSRF (NO HttpOnly: el JS la lee para reenviarla en header). */
export const CSRF_COOKIE = 'csrf_token';

/** Header donde el cliente reenvía el token CSRF (patrón double-submit). */
export const CSRF_HEADER = 'x-csrf-token';

/** Nombre de la cookie HttpOnly que transporta el refresh token (opaco). */
export const REFRESH_TOKEN_COOKIE = 'refresh_token';

/** Header explícito para rutas globales como /auth/me y /auth/refresh. */
export const AUTH_CONTEXT_HEADER = 'x-auth-context';

const ACCESS_TOKEN_COOKIES: Record<AuthCookieContext, string> = {
  admin: 'admin_access_token',
  tenant: 'tenant_access_token',
  owner: 'owner_access_token',
  vendor: 'vendor_access_token',
};

const REFRESH_TOKEN_COOKIES: Record<AuthCookieContext, string> = {
  admin: 'admin_refresh_token',
  tenant: 'tenant_refresh_token',
  owner: 'owner_refresh_token',
  vendor: 'vendor_refresh_token',
};

/**
 * Extrae el access token con la misma prioridad en toda la aplicación.
 * La cookie es la fuente principal; Bearer se conserva para integraciones.
 */
export function extractAccessToken(req: Request): string | null {
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  const context = authCookieContextFromRequest(req);
  const contextCookieName = context ? accessTokenCookieName(context) : null;
  const contextToken = contextCookieName ? cookies?.[contextCookieName] : null;
  if (typeof contextToken === 'string' && contextToken.length > 0) {
    return contextToken;
  }

  if (!context) {
    const cookieToken = cookies?.[ACCESS_TOKEN_COOKIE];
    if (typeof cookieToken === 'string' && cookieToken.length > 0) {
      return cookieToken;
    }
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

export function extractRefreshToken(req: Request): string | null {
  const cookies = (req as { cookies?: Record<string, string> }).cookies;
  const context = authCookieContextFromRequest(req);
  const contextCookieName = context ? refreshTokenCookieName(context) : null;
  const contextToken = contextCookieName ? cookies?.[contextCookieName] : null;
  if (typeof contextToken === 'string' && contextToken.length > 0) {
    return contextToken;
  }

  if (!context) {
    const legacyToken = cookies?.[REFRESH_TOKEN_COOKIE];
    if (typeof legacyToken === 'string' && legacyToken.length > 0) {
      return legacyToken;
    }
  }

  return null;
}

export function accessTokenCookieName(context: AuthCookieContext): string {
  return ACCESS_TOKEN_COOKIES[context];
}

export function refreshTokenCookieName(context: AuthCookieContext): string {
  return REFRESH_TOKEN_COOKIES[context];
}

export function allSessionCookieNames(): string[] {
  return [
    ACCESS_TOKEN_COOKIE,
    REFRESH_TOKEN_COOKIE,
    ...Object.values(ACCESS_TOKEN_COOKIES),
    ...Object.values(REFRESH_TOKEN_COOKIES),
  ];
}

export function authCookieContextFromRole(
  role: string | null | undefined,
): AuthCookieContext {
  if (role === 'INQUILINO' || role === 'TENANT') return 'tenant';
  if (role === 'PROPIETARIO') return 'owner';
  if (role === 'VENDOR') return 'vendor';
  return 'admin';
}

export function authCookieContextFromRequest(
  req: Request,
): AuthCookieContext | null {
  const headerContext = normalizeAuthCookieContext(req.headers[AUTH_CONTEXT_HEADER]);
  if (headerContext) return headerContext;

  const path = (req.originalUrl || req.url || '').split(/[?#]/, 1)[0];
  if (/^\/[^/]+\/(?:admin|tecnico)(?:\/|$)/.test(path)) return 'admin';
  if (/^\/[^/]+\/tenant(?:\/|$)/.test(path)) return 'tenant';
  if (/^\/[^/]+\/owner(?:\/|$)/.test(path)) return 'owner';
  if (/^\/[^/]+\/vendor(?:\/|$)/.test(path)) return 'vendor';

  return null;
}

export function clearAuthCookies(
  res: Response,
  context: AuthCookieContext | null,
): void {
  const { maxAge: _a, ...clearAccess } = authCookieOptions();
  const { maxAge: _r, ...clearRefresh } = refreshCookieOptions();
  void _a;
  void _r;

  if (context) {
    res.clearCookie(accessTokenCookieName(context), clearAccess);
    res.clearCookie(refreshTokenCookieName(context), clearRefresh);
    res.clearCookie(ACCESS_TOKEN_COOKIE, clearAccess);
    res.clearCookie(REFRESH_TOKEN_COOKIE, clearRefresh);
    return;
  }

  res.clearCookie(ACCESS_TOKEN_COOKIE, clearAccess);
  res.clearCookie(REFRESH_TOKEN_COOKIE, clearRefresh);
  for (const name of Object.values(ACCESS_TOKEN_COOKIES)) {
    res.clearCookie(name, clearAccess);
  }
  for (const name of Object.values(REFRESH_TOKEN_COOKIES)) {
    res.clearCookie(name, clearRefresh);
  }
}

function normalizeAuthCookieContext(value: unknown): AuthCookieContext | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return null;
  return ['admin', 'tenant', 'owner', 'vendor'].includes(raw)
    ? (raw as AuthCookieContext)
    : null;
}

const DEFAULT_REFRESH_COOKIE_PATH = '/auth';

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
 * Ruta visible por el navegador para la cookie de refresh. En despliegues con
 * reverse proxy que publica la API bajo `/api` y reescribe hacia el backend,
 * debe configurarse como `/api/auth`; si no, el navegador no envía la cookie a
 * POST /api/auth/refresh y la sesión cae cuando vence el access token.
 */
export function refreshCookiePath(): string {
  const configured = process.env.REFRESH_COOKIE_PATH?.trim();
  if (!configured) {
    return DEFAULT_REFRESH_COOKIE_PATH;
  }

  if (
    !configured.startsWith('/') ||
    configured.includes('..') ||
    configured.includes(';') ||
    configured.includes(',') ||
    /\s/.test(configured)
  ) {
    throw new Error(
      'REFRESH_COOKIE_PATH debe ser un path absoluto de cookie, por ejemplo /auth o /api/auth',
    );
  }

  return configured.length > 1 ? configured.replace(/\/+$/, '') : configured;
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
 * Opciones de la cookie de refresh. Igual que la de acceso pero acotada a la
 * ruta pública de auth y con vida más larga.
 */
export function refreshCookieOptions(): CookieOptions {
  return {
    ...authCookieOptions(),
    path: refreshCookiePath(),
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
