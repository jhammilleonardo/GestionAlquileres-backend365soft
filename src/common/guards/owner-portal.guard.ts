import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';

/**
 * Guard exclusivo del portal de propietarios (`/:slug/owner/*`).
 *
 * Valida que:
 * 1. El usuario autenticado tenga rol `PROPIETARIO`.
 * 2. El JWT contenga un `rentalOwnerId` válido (resuelto en el login).
 *
 * Uso:
 *   @UseGuards(JwtAuthGuard, OwnerPortalGuard)
 */
@Injectable()
export class OwnerPortalGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const { user } = context.switchToHttp().getRequest();

    if (user?.role !== 'PROPIETARIO') {
      throw new ForbiddenException(
        'Acceso denegado: se requiere rol PROPIETARIO',
      );
    }

    if (!user.rentalOwnerId || typeof user.rentalOwnerId !== 'number') {
      throw new ForbiddenException(
        'Token inválido: propietario sin rental_owner_id resuelto',
      );
    }

    return true;
  }
}
