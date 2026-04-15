import { SetMetadata } from '@nestjs/common';
import { AVAILABLE_MODULES } from '../../employees/dto/create-employee.dto';

export type PermissionAction = 'view' | 'create' | 'edit' | 'delete';
export type PermissionModule = (typeof AVAILABLE_MODULES)[number];

export const PERMISSION_KEY = 'required_permission';

export const RequirePermission = (
  module: PermissionModule,
  action: PermissionAction,
) => SetMetadata(PERMISSION_KEY, { module, action });
