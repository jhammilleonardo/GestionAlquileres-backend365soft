import { PermissionsGuard } from './permissions.guard';
import { Reflector } from '@nestjs/core';
import { ForbiddenException } from '@nestjs/common';
import { PERMISSION_KEY } from '../decorators/require-permission.decorator';
import { DataSource } from 'typeorm';

function buildContext(user: object | null, handler = {}, classRef = {}) {
  return {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({
      getRequest: () => ({ user }),
    }),
  } as any;
}

function buildReflector(permission: { module: string; action: string } | undefined) {
  return {
    getAllAndOverride: (_key: string) => permission,
  } as unknown as Reflector;
}

function buildDataSource(rows: object[]) {
  return {
    query: jest.fn().mockResolvedValue(rows),
  } as unknown as DataSource;
}

describe('PermissionsGuard', () => {
  // ─── Sin @RequirePermission ───────────────────────────────────────────────

  it('permite acceso cuando no hay @RequirePermission declarado', async () => {
    const guard = new PermissionsGuard(buildReflector(undefined), buildDataSource([]));
    const result = await guard.canActivate(buildContext({ role: 'INQUILINO', userId: 1 }));
    expect(result).toBe(true);
  });

  // ─── ADMIN / SUPERADMIN ───────────────────────────────────────────────────

  it('permite acceso a ADMIN en cualquier módulo', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'payments', action: 'delete' }),
      buildDataSource([]),
    );
    const result = await guard.canActivate(buildContext({ role: 'ADMIN', userId: 1 }));
    expect(result).toBe(true);
  });

  it('permite acceso a SUPERADMIN en cualquier módulo', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'config', action: 'edit' }),
      buildDataSource([]),
    );
    const result = await guard.canActivate(buildContext({ role: 'SUPERADMIN', userId: 1 }));
    expect(result).toBe(true);
  });

  // ─── TECNICO ─────────────────────────────────────────────────────────────

  it('permite a TECNICO ver maintenance', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'view' }),
      buildDataSource([]),
    );
    const result = await guard.canActivate(buildContext({ role: 'TECNICO', userId: 2 }));
    expect(result).toBe(true);
  });

  it('permite a TECNICO crear en maintenance', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'create' }),
      buildDataSource([]),
    );
    const result = await guard.canActivate(buildContext({ role: 'TECNICO', userId: 2 }));
    expect(result).toBe(true);
  });

  it('permite a TECNICO editar en maintenance', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'edit' }),
      buildDataSource([]),
    );
    const result = await guard.canActivate(buildContext({ role: 'TECNICO', userId: 2 }));
    expect(result).toBe(true);
  });

  it('bloquea a TECNICO en DELETE de maintenance', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'delete' }),
      buildDataSource([]),
    );
    await expect(
      guard.canActivate(buildContext({ role: 'TECNICO', userId: 2 })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloquea a TECNICO en cualquier otro módulo', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'payments', action: 'view' }),
      buildDataSource([]),
    );
    await expect(
      guard.canActivate(buildContext({ role: 'TECNICO', userId: 2 })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── EMPLEADO ─────────────────────────────────────────────────────────────

  it('permite a EMPLEADO con permiso can_view=true', async () => {
    const ds = buildDataSource([{ allowed: true }]);
    const guard = new PermissionsGuard(
      buildReflector({ module: 'properties', action: 'view' }),
      ds,
    );
    const result = await guard.canActivate(buildContext({ role: 'EMPLEADO', userId: 3 }));
    expect(result).toBe(true);
    expect(ds.query).toHaveBeenCalledWith(
      expect.stringContaining('can_view'),
      [3, 'properties'],
    );
  });

  it('bloquea a EMPLEADO con can_view=false', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'properties', action: 'view' }),
      buildDataSource([{ allowed: false }]),
    );
    await expect(
      guard.canActivate(buildContext({ role: 'EMPLEADO', userId: 3 })),
    ).rejects.toThrow(ForbiddenException);
  });

  it('bloquea a EMPLEADO sin fila en employee_permissions', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'contracts', action: 'delete' }),
      buildDataSource([]),
    );
    await expect(
      guard.canActivate(buildContext({ role: 'EMPLEADO', userId: 3 })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── INQUILINO ────────────────────────────────────────────────────────────

  it('bloquea a INQUILINO en endpoints de admin', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'view' }),
      buildDataSource([]),
    );
    await expect(
      guard.canActivate(buildContext({ role: 'INQUILINO', userId: 4 })),
    ).rejects.toThrow(ForbiddenException);
  });

  // ─── Sin usuario ──────────────────────────────────────────────────────────

  it('bloquea cuando no hay usuario en el request', async () => {
    const guard = new PermissionsGuard(
      buildReflector({ module: 'maintenance', action: 'view' }),
      buildDataSource([]),
    );
    await expect(
      guard.canActivate(buildContext(null)),
    ).rejects.toThrow(ForbiddenException);
  });
});
