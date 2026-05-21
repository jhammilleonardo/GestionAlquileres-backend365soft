import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type {
  RequestUserContext,
  TenantRequest,
} from '../middleware/tenant-context.middleware';

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): RequestUserContext | undefined => {
    const request = ctx.switchToHttp().getRequest<TenantRequest>();
    return request.user;
  },
);
