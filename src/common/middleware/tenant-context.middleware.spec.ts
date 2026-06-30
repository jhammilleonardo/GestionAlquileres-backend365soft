import { NotFoundException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '../config';
import {
  TenantContextMiddleware,
  TenantRequest,
} from './tenant-context.middleware';
import {
  ACCESS_TOKEN_COOKIE,
  accessTokenCookieName,
} from '../../auth/auth-cookie.util';

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

  it('does not treat the global tenants API as a tenant slug', async () => {
    await middleware.use(
      buildRequest('/tenants/slug/365group'),
      {} as never,
      next,
    );

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
      tokenVersion: 0,
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([
      {
        id: 7,
        email: 'admin@test.com',
        role: 'ADMIN',
        is_active: true,
        token_version: 0,
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
      tokenVersion: 0,
    });
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, email, role, is_active, token_version FROM "tenant_acme"."user" WHERE id = $1',
      [7],
    );
    expectSearchPathWasNotMutated(dataSource.query);
  });

  it('does not trust a cookie issued for a different tenant slug', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'other',
    });

    const req = buildRequest(
      '/acme/admin/properties',
      {},
      { [accessTokenCookieName('admin')]: 'cookie-token' },
    );

    await expect(middleware.use(req, {} as never, next)).rejects.toMatchObject({
      status: 401,
    });

    expect(req.tenant).toBeUndefined();
    expect(req.user).toBeUndefined();
    expect(jwtService.verify).toHaveBeenCalledWith('cookie-token', {
      secret: 'a'.repeat(32),
    });
    expect(authSecurityService.recordTenantMismatch).toHaveBeenCalledWith({
      email: 'admin@test.com',
      userId: 7,
      requestTenantSlug: 'acme',
      tokenTenantSlug: 'other',
      path: '/acme/admin/properties',
      reason: 'url_slug_mismatch',
    });
    expect(dataSource.query).not.toHaveBeenCalled();
    expect(next).not.toHaveBeenCalled();
  });

  it('treats a foreign cookie as anonymous on public catalog routes', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'other',
    });
    dataSource.query.mockResolvedValueOnce([tenant]);
    const req = buildRequest(
      '/acme/catalog/properties',
      {},
      { [ACCESS_TOKEN_COOKIE]: 'cookie-token' },
    );

    await middleware.use(req, {} as never, next);

    expect(req.tenant).toEqual(tenant);
    expect(req.user).toBeUndefined();
    expect(authSecurityService.recordTenantMismatch).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rejects a session when the current user is inactive', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
      tokenVersion: 0,
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([
      {
        id: 7,
        email: 'admin@test.com',
        role: 'ADMIN',
        is_active: false,
        token_version: 0,
      },
    ]);

    await expect(
      middleware.use(
        buildRequest(
          '/acme/admin/properties',
          {},
          {
            [ACCESS_TOKEN_COOKIE]: 'cookie-token',
            [accessTokenCookieName('admin')]: 'cookie-token',
          },
        ),
        {} as never,
        next,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authSecurityService.recordTenantMismatch).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'inactive_user_session' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('rejects stale role claims from an otherwise active user', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
      tokenVersion: 0,
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([
      {
        id: 7,
        email: 'admin@test.com',
        role: 'EMPLEADO',
        is_active: true,
        token_version: 0,
      },
    ]);

    await expect(
      middleware.use(
        buildRequest(
          '/acme/admin/properties',
          {},
          {
            [ACCESS_TOKEN_COOKIE]: 'cookie-token',
            [accessTokenCookieName('admin')]: 'cookie-token',
          },
        ),
        {} as never,
        next,
      ),
    ).rejects.toThrow(UnauthorizedException);

    expect(authSecurityService.recordTenantMismatch).toHaveBeenCalledWith(
      expect.objectContaining({ reason: 'stale_user_claims' }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it('continues anonymously on catalog routes when session version is stale', async () => {
    jwtService.verify.mockReturnValue({
      sub: 7,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'acme',
      tokenVersion: 1,
    });
    dataSource.query.mockResolvedValueOnce([tenant]).mockResolvedValueOnce([
      {
        id: 7,
        email: 'admin@test.com',
        role: 'ADMIN',
        is_active: true,
        token_version: 2,
      },
    ]);
    const req = buildRequest(
      '/acme/catalog/properties',
      {},
      {
        [ACCESS_TOKEN_COOKIE]: 'cookie-token',
      },
    );

    await middleware.use(req, {} as never, next);

    expect(req.tenant).toEqual(tenant);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledTimes(1);
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
  cookies: Record<string, string> = {},
): TenantRequest {
  return {
    originalUrl,
    headers,
    cookies,
  } as TenantRequest;
}

function expectSearchPathWasNotMutated(query: jest.Mock): void {
  for (const [sql] of query.mock.calls as Array<[string, unknown[]?]>) {
    expect(sql).not.toMatch(/SET\s+search_path/i);
  }
}
