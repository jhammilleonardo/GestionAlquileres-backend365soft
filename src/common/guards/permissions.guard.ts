import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  PERMISSION_KEY,
  PermissionAction,
  PermissionModule,
} from '../decorators/require-permission.decorator';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

// Módulos que TECNICO puede acceder (hardcodeado por requerimiento del negocio)
const TECNICO_ALLOWED: Record<string, PermissionAction[]> = {
  maintenance: ['view', 'create', 'edit'],
  inspections: ['view', 'create', 'edit'],
};

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    @InjectDataSource() private dataSource: DataSource,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const permission = this.reflector.getAllAndOverride<{
      module: PermissionModule;
      action: PermissionAction;
    }>(PERMISSION_KEY, [context.getHandler(), context.getClass()]);

    // Si el endpoint no declara @RequirePermission, pasa libremente
    if (!permission) {
      return true;
    }

    const { user } = context.switchToHttp().getRequest<TenantRequest>();

    if (!user) {
      throw new ForbiddenException('No autenticado');
    }

    const { role, userId } = user;

    // ADMIN y SUPERADMIN tienen acceso total
    if (role === 'ADMIN' || role === 'SUPERADMIN') {
      return true;
    }

    // TECNICO: permisos hardcodeados, solo maintenance con view/create/edit
    if (role === 'TECNICO') {
      const allowed = TECNICO_ALLOWED[permission.module];
      if (allowed && allowed.includes(permission.action)) {
        return true;
      }
      throw new ForbiddenException(
        `TECNICO no tiene acceso a ${permission.module}:${permission.action}`,
      );
    }

    // EMPLEADO: permisos configurables — consulta la tabla employee_permissions
    if (role === 'EMPLEADO') {
      const column = `can_${permission.action}`;
      const rows = await this.dataSource.query<Array<{ allowed: boolean }>>(
        `SELECT ${column} AS allowed
         FROM employee_permissions
         WHERE user_id = $1 AND module = $2`,
        [userId, permission.module],
      );

      if (rows.length > 0 && rows[0].allowed) {
        return true;
      }

      throw new ForbiddenException(
        `Sin permiso para ${permission.module}:${permission.action}`,
      );
    }

    // INQUILINO u otros roles no tienen acceso a endpoints de admin
    throw new ForbiddenException('Rol no autorizado para esta acción');
  }
}
