import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { TenantRequest } from '../../common/middleware/tenant-context.middleware';
import { JwtStrategy } from './jwt.strategy';

describe('JwtStrategy tenant isolation', () => {
  const strategy = new JwtStrategy({
    get: jest.fn().mockReturnValue('a'.repeat(64)),
  } as unknown as ConfigService);

  const payload = {
    sub: 7,
    email: 'admin@test.com',
    role: 'ADMIN',
    tenantSlug: 'acme',
  };

  it('accepts a token for the tenant resolved from the URL', () => {
    const user = strategy.validate(buildRequest('acme'), payload);

    expect(user).toEqual(
      expect.objectContaining({ userId: 7, tenantSlug: 'acme' }),
    );
  });

  it('rejects a cookie token issued for another tenant', () => {
    expect(() => strategy.validate(buildRequest('other'), payload)).toThrow(
      UnauthorizedException,
    );
  });

  it('allows global routes to derive their tenant from the token', () => {
    const user = strategy.validate({} as TenantRequest, payload);

    expect(user.tenantSlug).toBe('acme');
  });
});

function buildRequest(slug: string): TenantRequest {
  return {
    tenant: {
      id: 1,
      slug,
      schema_name: `tenant_${slug}`,
      company_name: slug,
      currency: 'BOB',
      locale: 'es-BO',
    },
  } as TenantRequest;
}
