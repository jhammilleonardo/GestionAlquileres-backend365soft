import {
  Injectable,
  NestMiddleware,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { quoteIdent } from '../utils/sql-identifier';
import { RESERVED_TENANT_SLUGS } from '../utils/tenant-slug';
import { AuthSecurityService } from '../../auth/auth-security.service';
import { extractAccessToken } from '../../auth/auth-cookie.util';

export interface TenantContext {
  id: number;
  slug: string;
  schema_name: string;
  company_name: string;
  currency: string;
  locale: string;
}

export interface RequestUserContext {
  userId: number;
  email: string;
  role: string;
  tenantSlug?: string;
  rentalOwnerId?: number | null;
  vendorId?: number | null;
  tokenVersion?: number;
}

export interface TenantRequest extends Request {
  tenant?: TenantContext;
  user?: RequestUserContext;
}

interface TenantJwtPayload {
  sub: number;
  email: string;
  role: string;
  tenantSlug?: string;
  tokenVersion?: number;
}

interface TenantUserSessionRow {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  token_version: number;
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private jwtService: JwtService,
    private configService: ConfigService,
    private authSecurityService: AuthSecurityService,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    // Extraer el slug de la URL (primer segmento)
    const urlSlug = this.extractSlugFromUrl(req.originalUrl);

    let tenantSlug: string | null = null;

    // La URL manda cuando contiene tenant. El JWT solo completa el contexto en
    // rutas globales (p. ej. /auth/me) y nunca puede cambiar el schema pedido.
    const token = extractAccessToken(req);
    if (token) {
      try {
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET no configurado correctamente');
        }
        const payload = this.jwtService.verify(token, { secret }) as unknown;

        if (isTenantJwtPayload(payload) && payload.tenantSlug) {
          if (urlSlug && urlSlug !== payload.tenantSlug) {
            tenantSlug = urlSlug;
            if (!this.isAnonymousTenantPath(req.originalUrl)) {
              await this.authSecurityService.recordTenantMismatch({
                email: payload.email,
                userId: payload.sub,
                requestTenantSlug: urlSlug,
                tokenTenantSlug: payload.tenantSlug,
                path: req.originalUrl,
                reason: 'url_slug_mismatch',
              });
              throw new UnauthorizedException(
                'Authentication token is not valid for this company',
              );
            }
          } else {
            tenantSlug = payload.tenantSlug;

            req.user = {
              userId: payload.sub,
              email: payload.email,
              role: payload.role,
              tenantSlug: payload.tenantSlug,
              tokenVersion: payload.tokenVersion,
            };
          }
        }
      } catch (error) {
        if (error instanceof UnauthorizedException) {
          throw error;
        }
        // Continuar sin lanzar error, podría ser un endpoint público o token inválido
      }
    }

    // Estrategia 2: Si no hay slug del JWT, usar el de la URL (para endpoints públicos)
    if (!tenantSlug && urlSlug) {
      tenantSlug = urlSlug;
    }

    // Si tenemos un slug identificado, configurar el contexto del tenant
    if (tenantSlug) {
      // IMPORTANTE: Consultar siempre con schema explícito. El middleware corre
      // antes del TenantConnectionInterceptor, por lo que no debe depender de
      // SET search_path ni modificar conexiones compartidas del pool.
      const tenants = await this.dataSource.query<TenantRequest['tenant'][]>(
        'SELECT * FROM public.tenant WHERE slug = $1 AND is_active = true',
        [tenantSlug],
      );

      const tenant = tenants[0];

      if (!tenant) {
        throw new NotFoundException(`Active tenant '${tenantSlug}' not found`);
      }

      // VERIFICACIÓN ADICIONAL: Si hay un usuario logueado, verificar que EXISTA en este esquema
      // Esto previene el uso de tokens de un tenant en otro tenant
      if (req.user) {
        const sessionUser = req.user;
        try {
          const userTable = `${quoteIdent(tenant.schema_name)}."user"`;
          const userRows = await this.dataSource.query<TenantUserSessionRow[]>(
            `SELECT id, email, role, is_active, token_version FROM ${userTable} WHERE id = $1`,
            [sessionUser.userId],
          );
          const currentUser = userRows[0];

          if (!currentUser) {
            await this.authSecurityService.recordTenantMismatch({
              email: sessionUser.email,
              userId: sessionUser.userId,
              requestTenantSlug: tenant.slug,
              tokenTenantSlug: sessionUser.tenantSlug ?? tenant.slug,
              path: req.originalUrl,
              reason: 'user_not_found_in_tenant_schema',
            });
            if (this.isAnonymousTenantPath(req.originalUrl)) {
              req.user = undefined;
              req.tenant = tenant;
              return next();
            }
            throw new UnauthorizedException(
              'User not authorized for this company',
            );
          }

          const claimsAreCurrent =
            currentUser.is_active &&
            currentUser.role === sessionUser.role &&
            currentUser.email.toLowerCase() ===
              sessionUser.email.toLowerCase() &&
            currentUser.token_version === sessionUser.tokenVersion;
          if (!claimsAreCurrent) {
            await this.authSecurityService.recordTenantMismatch({
              email: sessionUser.email,
              userId: sessionUser.userId,
              requestTenantSlug: tenant.slug,
              tokenTenantSlug: sessionUser.tenantSlug ?? tenant.slug,
              path: req.originalUrl,
              reason: currentUser.is_active
                ? 'stale_user_claims'
                : 'inactive_user_session',
            });
            if (this.isAnonymousTenantPath(req.originalUrl)) {
              req.user = undefined;
              req.tenant = tenant;
              return next();
            }
            throw new UnauthorizedException('Session is no longer valid');
          }
        } catch (error) {
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          if (this.isAnonymousTenantPath(req.originalUrl)) {
            req.user = undefined;
            req.tenant = tenant;
            return next();
          }
          // El schema no tiene tabla user (schema no inicializado), tratar como no autorizado
          await this.authSecurityService.recordTenantMismatch({
            email: sessionUser.email,
            userId: sessionUser.userId,
            requestTenantSlug: tenant.slug,
            tokenTenantSlug: sessionUser.tenantSlug ?? tenant.slug,
            path: req.originalUrl,
            reason: 'tenant_user_lookup_failed',
          });
          throw new UnauthorizedException(
            'User not authorized for this company',
          );
        }
      }

      req.tenant = tenant;
    }

    next();
  }

  /**
   * Extrae el slug de la URL del primer segmento
   * Retorna null si el primer segmento es una palabra reservada
   */
  private extractSlugFromUrl(path: string): string | null {
    const urlParts = path.split('/').filter(Boolean);

    if (urlParts.length === 0) {
      return null;
    }

    const firstSegment = urlParts[0];

    if (RESERVED_TENANT_SLUGS.has(firstSegment)) {
      return null;
    }

    return firstSegment;
  }

  private isAnonymousTenantPath(path: string): boolean {
    const [, section] = path.split(/[?#]/, 1)[0].split('/').filter(Boolean);
    return section === 'catalog' || section === 'publico';
  }
}

function isTenantJwtPayload(payload: unknown): payload is TenantJwtPayload {
  if (!payload || typeof payload !== 'object') {
    return false;
  }

  const candidate = payload as Partial<TenantJwtPayload>;
  const hasTenantSlug =
    candidate.tenantSlug === undefined ||
    typeof candidate.tenantSlug === 'string';

  return (
    typeof candidate.sub === 'number' &&
    typeof candidate.email === 'string' &&
    typeof candidate.role === 'string' &&
    (candidate.tokenVersion === undefined ||
      typeof candidate.tokenVersion === 'number') &&
    hasTenantSlug
  );
}
