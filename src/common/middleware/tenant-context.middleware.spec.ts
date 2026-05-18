import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../config';
import {
  TenantContextMiddleware,
  TenantRequest,
} from './tenant-context.middleware';

describe('TenantContextMiddleware', () => {
  const tenant = {
    id: 1,
    slug: 'acme',
    schema_name: 'tenant_acme',
    company_name: 'Acme',
    currency: 'BOB',
    locale: 'es-BO',
  };

  let dataSource: { query: jest.Mock };
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };
  let authSecurityService: { recordTenantMismatch: jest.Mock };
  let middleware: TenantContextMiddleware;
  let next: jest.Mock;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    jwtService = { verify: jest.fn() };
    configService = {
      get: jest.fn().mockReturnValue('a'.repeat(32)),
    };
    authSecurityService = {
      recordTenantMismatch: jest.fn().mockResolvedValue(undefined),
    };
    middleware = new TenantContextMiddleware(
      dataSource as never,
      jwtService as never,
      configService as unknown as ConfigService,
      authSecurityService as never,
    );
    next = jest.fn();
  });

  it('skips tenant lookup for reserved root paths without touching search_path', async () => {
    await middleware.use(buildRequest('/health'), {} as never, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('resolves a public tenant URL without mutating search_path', async () => {
    dataSource.query.mockResolvedValueOnce([tenant]);
    const req = buildRequest('/acme/properties');

    await middleware.use(req, {} as never, next);

    expect(req.tenant).toEqual(tenant);
    expect(next).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT * FROM public.tenant WHERE slug = $1 AND is_active = true',
      ['acme'],
    );
    expectSearchPathWasNotMutated(dataSource.query);
  });

  it('verifies authenticated users with a schema-qualified user table', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([
      {
        id: 7,
      },
    ]);
    const req = buildRequest('/acme/contracts', {
      authorization: 'Bearer token',
    });

    await middleware.use(req, {} as never, next);

    expect(req.user).toEqual({
      userId: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM "tenant_acme"."user" WHERE id = $1',
      [7],
    );
    expectSearchPathWasNotMutated(dataSource.query);
  });

  it('rejects tokens issued for a different tenant slug', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'other',
    });

    await expect(
      middleware.use(
        buildRequest('/acme/contracts', { authorization: 'Bearer token' }),
        {} as never,
        next,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(dataSource.query).not.toHaveBeenCalled();
    expect(authSecurityService.recordTenantMismatch).toHaveBeenCalledWith({
      email: 'admin@test.com',
      userId: 7,
      requestTenantSlug: 'acme',
      tokenTenantSlug: 'other',
      path: '/acme/contracts',
      reason: 'url_slug_mismatch',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('records tenant mismatch when JWT user does not exist in resolved schema', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([]);

    await expect(
      middleware.use(
        buildRequest('/acme/contracts', { authorization: 'Bearer token' }),
        {} as never,
        next,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authSecurityService.recordTenantMismatch).toHaveBeenCalledWith({
      email: 'admin@test.com',
      userId: 7,
      requestTenantSlug: 'acme',
      tokenTenantSlug: 'acme',
      path: '/acme/contracts',
      reason: 'user_not_found_in_tenant_schema',
    });
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects unknown active tenants', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      middleware.use(buildRequest('/missing/properties'), {} as never, next),
    ).rejects.toThrow(NotFoundException);

    expectSearchPathWasNotMutated(dataSource.query);
    expect(next).not.toHaveBeenCalled();
  });
});

function buildRequest(
  originalUrl: string,
  headers: Record<string, string> = {},
): TenantRequest {
  return {
    originalUrl,
    headers,
  } as TenantRequest;
}

function expectSearchPathWasNotMutated(query: jest.Mock): void {
  for (const [sql] of query.mock.calls as Array<[string, unknown[]?]>) {
    expect(sql).not.toMatch(/SET\s+search_path/i);
  }
}
