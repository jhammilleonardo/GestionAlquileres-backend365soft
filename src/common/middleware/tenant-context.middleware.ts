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

export interface TenantRequest extends Request {
  tenant?: {
    id: number;
    slug: string;
    schema_name: string;
    company_name: string;
    currency: string;
    locale: string;
  };
  user?: {
    userId: number;
    email: string;
    role: string;
    tenantSlug?: string;
  };
}

@Injectable()
export class TenantContextMiddleware implements NestMiddleware {
  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async use(req: TenantRequest, _res: Response, next: NextFunction) {
    // 1. Siempre resetear al esquema public al inicio de cada petición
    // Esto evita que una petición use el esquema de la petición anterior en el pool de conexiones
    await this.dataSource.query('SET search_path TO public');

    // Extraer el slug de la URL (primer segmento)
    const urlSlug = this.extractSlugFromUrl(req.originalUrl);

    let tenantSlug: string | null = null;

    // Estrategia 1: Extraer tenant del JWT (para endpoints privados)
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      try {
        const token = authHeader.substring(7);
        const payload = this.jwtService.verify(token, {
          secret:
            this.configService.get<string>('JWT_SECRET') ||
            'your-secret-key-change-in-production',
        });

        if (payload.tenantSlug) {
          tenantSlug = payload.tenantSlug;

          // VERIFICACIÓN DE SEGURIDAD: El slug de la URL debe coincidir con el del JWT
          // Esto previene que un usuario acceda a datos de otro tenant manipulando la URL
          if (urlSlug && urlSlug !== tenantSlug) {
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
      // IMPORTANTE: Consultar en schema public porque la tabla tenant está ahí
      const tenant = await this.dataSource.query(
        'SELECT * FROM public.tenant WHERE slug = $1',
        [tenantSlug],
      );

      if (!tenant || tenant.length === 0) {
        throw new NotFoundException(`Tenant '${tenantSlug}' not found`);
      }

      // Cambiar al esquema del tenant
      // Esto asegura que cualquier query posterior solo vea los datos de ESTE tenant
      await this.dataSource.query(
        `SET search_path TO ${tenant[0].schema_name}, public`,
      );

      // VERIFICACIÓN ADICIONAL: Si hay un usuario logueado, verificar que EXISTA en este esquema
      // Esto previene el uso de tokens de un tenant en otro tenant
      if (req.user) {
        try {
          const [userExists] = await this.dataSource.query(
            'SELECT id FROM "user" WHERE id = $1',
            [req.user.userId],
          );

          if (!userExists) {
            // Si el ID de usuario no existe en este esquema, el token no es válido para este tenant
            throw new UnauthorizedException(
              'User not authorized for this company',
            );
          }
        } catch (error) {
          if (error instanceof UnauthorizedException) {
            throw error;
          }
          // El schema no tiene tabla user (schema no inicializado), tratar como no autorizado
          throw new UnauthorizedException(
            'User not authorized for this company',
          );
        }
      }

      req.tenant = tenant[0];
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
    const reservedWords = [
      'api',
      'health',
      'docs',
      'auth',
      'login',
      'register',
    ];

    if (reservedWords.includes(firstSegment)) {
      return null;
    }

    return firstSegment;
  }
}
