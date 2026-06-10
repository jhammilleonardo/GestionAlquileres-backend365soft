import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

/**
 * Guard exclusivo del portal de proveedores (`/:slug/vendor/*`).
 *
 * Valida que:
 * 1. El usuario autenticado tenga rol `VENDOR`.
 * 2. El JWT contenga un `vendorId` válido (resuelto en el login).
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, VendorPortalGuard)
 */
@Injectable()
export class VendorPortalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest<TenantRequest>();

    if (user?.role !== 'VENDOR') {
      throw new ForbiddenException('Acceso denegado: se requiere rol VENDOR');
    }

    if (!user.vendorId || typeof user.vendorId !== 'number') {
      throw new ForbiddenException(
        'Token inválido: proveedor sin vendor_id resuelto',
      );
    }

    return true;
  }
}
