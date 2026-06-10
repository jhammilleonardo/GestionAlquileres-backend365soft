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
import { AuthSecurityService } from '../../auth/auth-security.service';

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

    // Estrategia 1: Extraer tenant del JWT (para endpoints privados)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const secret = this.configService.get<string>('JWT_SECRET');
        if (!secret || secret.length < 32) {
          throw new Error('JWT_SECRET no configurado correctamente');
        }
        const payload = this.jwtService.verify(token, { secret }) as unknown;

        if (isTenantJwtPayload(payload) && payload.tenantSlug) {
          tenantSlug = payload.tenantSlug;

          // VERIFICACIÓN DE SEGURIDAD: El slug de la URL debe coincidir con el del JWT
          // Esto previene que un usuario acceda a datos de otro tenant manipulando la URL
          if (urlSlug && urlSlug !== tenantSlug) {
            await this.authSecurityService.recordTenantMismatch({
              email: payload.email,
              userId: payload.sub,
              requestTenantSlug: urlSlug,
              tokenTenantSlug: tenantSlug,
              path: req.originalUrl,
              reason: 'url_slug_mismatch',
            });
            throw new UnauthorizedException(
              `Tenant slug "${urlSlug}" does not match your authentication token (${tenantSlug})`,
            );
          }

          // Asignar req.user con los datos del JWT para que esté disponible en los controllers
          req.user = {
            userId: payload.sub,
            email: payload.email,
            role: payload.role,
            tenantSlug: payload.tenantSlug,
          };
        }
      } catch (error) {
        // Si es UnauthorizedException, lanzarla
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
        try {
          const userTable = `${quoteIdent(tenant.schema_name)}."user"`;
          const userRows = await this.dataSource.query<Array<{ id: number }>>(
            `SELECT id FROM ${userTable} WHERE id = $1`,
            [req.user.userId],
          );
          const userExists = userRows[0];

          if (!userExists) {
            // Si el ID de usuario no existe en este esquema, el token no es válido para este tenant
            await this.authSecurityService.recordTenantMismatch({
              email: req.user.email,
              userId: req.user.userId,
              requestTenantSlug: tenant.slug,
              tokenTenantSlug: req.user.tenantSlug ?? tenant.slug,
              path: req.originalUrl,
              reason: 'user_not_found_in_tenant_schema',
            });
            throw new UnauthorizedException(
              'User not authorized for this company',
            );
          }
        } catch (error) {
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          // El schema no tiene tabla user (schema no inicializado), tratar como no autorizado
          await this.authSecurityService.recordTenantMismatch({
            email: req.user.email,
            userId: req.user.userId,
            requestTenantSlug: tenant.slug,
            tokenTenantSlug: req.user.tenantSlug ?? tenant.slug,
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

    // Palabras reservadas que NO son slugs de tenant
    // Debe mantenerse sincronizado con RESERVED_TENANT_SLUGS de tenant-slug.ts
    const reservedWords = [
      'admin',
      'api',
      'assets',
      'auth',
      'docs',
      'health',
      'i18n',
      'login',
      'portal',
      'public',
      'publico',
      'register',
      'static',
      'storage',
      'uploads',
      'www',
    ];

    if (reservedWords.includes(firstSegment)) {
      return null;
    }

    return firstSegment;
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
    hasTenantSlug
  );
}
