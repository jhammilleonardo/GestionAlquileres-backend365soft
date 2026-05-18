import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { TenantRequest } from '../middleware/tenant-context.middleware';

export const CurrentTenant = createParamDecorator(
  (data: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    return request.tenant;
  },
);
