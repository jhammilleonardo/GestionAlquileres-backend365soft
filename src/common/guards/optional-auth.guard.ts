import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    // Hacer que el guard sea opcional - no lance error si no hay token
    const request = context.switchToHttp().getRequest<TenantRequest>();
    const token = this.extractToken(request);

    if (!token) {
      // Si no hay token, continuar sin usuario
      delete request.user;
      return true;
    }

    // Si hay token, intentar validar
    return super.canActivate(context);
  }

  private extractToken(request: TenantRequest): string | null {
    const authHeader = request.headers.authorization;
    if (typeof authHeader === 'string' && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }
    return null;
  }
}
