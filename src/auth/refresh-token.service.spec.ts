import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

describe('RefreshTokenService', () => {
  let service: RefreshTokenService;
  let query: jest.Mock;

  const claims = {
    sub: 5,
    email: 'a@x.com',
    role: 'ADMIN',
    tenantSlug: 'demo',
    tokenVersion: 0,
  };

  beforeEach(() => {
    query = jest.fn().mockResolvedValue([]);
    service = new RefreshTokenService({ query } as never);
  });

  it('issue() emite un token hex de 64 chars y lo persiste hasheado', async () => {
    const token = await service.issue(claims);

    expect(token).toMatch(/^[0-9a-f]{64}$/);
    const [sql, params] = query.mock.calls[0] as [string, unknown[]];
    expect(sql).toContain('INSERT INTO public.refresh_tokens');
    // Se guarda el hash, nunca el token en claro.
    expect(params[0]).not.toBe(token);
    expect(params[0]).toMatch(/^[0-9a-f]{64}$/);
  });

  it('consume() devuelve claims y revoca (rotación) si el token es válido', async () => {
    const future = new Date(Date.now() + 3600_000);
    query
      .mockResolvedValueOnce([
        [
          {
            id: 1,
            user_id: 5,
            email: 'a@x.com',
            role: 'ADMIN',
            tenant_slug: 'demo',
            rental_owner_id: null,
            vendor_id: null,
            mfa_verified: false,
            token_version: 0,
            expires_at: future,
            revoked_at: new Date(),
          },
        ],
        1,
      ])
      .mockResolvedValueOnce([{ schema_name: 'tenant_demo' }])
      .mockResolvedValueOnce([
        {
          email: 'a@x.com',
          role: 'ADMIN',
          is_active: true,
          token_version: 0,
        },
      ]);

    const result = await service.consume('raw');

    expect(result).toMatchObject({ sub: 5, role: 'ADMIN', tenantSlug: 'demo' });
    const consumeCall = query.mock.calls[0] as [string, unknown[]];
    expect(consumeCall[0]).toContain('SET revoked_at = NOW()');
    expect(consumeCall[0]).toContain('AND revoked_at IS NULL');
    expect(consumeCall[0]).toContain('RETURNING *');
    expect(query).toHaveBeenCalledTimes(3);
  });

  it('consume() rechaza un token expirado', async () => {
    query.mockResolvedValueOnce([[], 0]);

    await expect(service.consume('raw')).rejects.toThrow(UnauthorizedException);
  });

  it('consume() rechaza un token ya revocado', async () => {
    query
      .mockResolvedValueOnce([[], 0])
      .mockResolvedValueOnce([
        {
          user_id: 5,
          tenant_slug: 'demo',
          role: 'ADMIN',
          revoked_at: new Date(),
        },
      ])
      .mockResolvedValueOnce([]);

    await expect(service.consume('raw')).rejects.toThrow(UnauthorizedException);
    const revokeCall = query.mock.calls[2] as [string, unknown[]];
    expect(revokeCall[0]).toContain('tenant_slug = $2');
    expect(revokeCall[0]).toContain('role = $3');
    expect(revokeCall[1]).toEqual([5, 'demo', 'ADMIN']);
  });

  it('consume() rechaza un token inexistente', async () => {
    query.mockResolvedValueOnce([[], 0]);
    await expect(service.consume('raw')).rejects.toThrow(UnauthorizedException);
  });
});
