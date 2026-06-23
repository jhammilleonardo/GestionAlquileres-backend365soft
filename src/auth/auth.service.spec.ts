import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { TenantsService } from '../tenants/tenants.service';
import { TenantAdminIndexService } from '../tenants/tenant-admin-index.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuthSecurityService } from './auth-security.service';
import * as bcrypt from 'bcrypt';
import { createHash } from 'crypto';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let tenantsService: { findBySlug: jest.Mock; findActiveBySlug: jest.Mock };
  let jwtService: { sign: jest.Mock; verify: jest.Mock };
  let dataSource: { query: jest.Mock; transaction: jest.Mock };
  let authSecurityService: {
    assertLoginAllowed: jest.Mock;
    recordFailure: jest.Mock;
    recordSuccess: jest.Mock;
    recordInactiveUserAttempt: jest.Mock;
  };

  beforeEach(async () => {
    tenantsService = {
      findBySlug: jest.fn(),
      findActiveBySlug: jest.fn(),
    };
    dataSource = { query: jest.fn(), transaction: jest.fn() };
    jwtService = {
      sign: jest.fn().mockReturnValue('signed-token'),
      verify: jest.fn(),
    };
    authSecurityService = {
      assertLoginAllowed: jest.fn().mockResolvedValue(undefined),
      recordFailure: jest.fn().mockResolvedValue(undefined),
      recordSuccess: jest.fn().mockResolvedValue(undefined),
      recordInactiveUserAttempt: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: TenantsService,
          useValue: tenantsService,
        },
        {
          provide: JwtService,
          useValue: jwtService,
        },
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
        {
          provide: NotificationsService,
          useValue: { createForUser: jest.fn() },
        },
        {
          provide: TenantAdminIndexService,
          useValue: { upsertAdmin: jest.fn().mockResolvedValue(undefined) },
        },
        {
          provide: AuthSecurityService,
          useValue: authSecurityService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    delete process.env.ADMIN_EMAIL_MFA_ENABLED;
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('records failed tenant login attempts', async () => {
    tenantsService.findActiveBySlug.mockResolvedValue({
      slug: 'demo',
      schema_name: 'tenant_demo',
    });
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.validateUser('user@email.com', 'bad-password', 'demo'),
    ).rejects.toThrow('Invalid credentials');

    expect(authSecurityService.assertLoginAllowed).toHaveBeenCalledWith(
      'user@email.com',
      'demo',
      'tenant_login',
    );
    expect(authSecurityService.recordFailure).toHaveBeenCalledWith({
      email: 'user@email.com',
      tenantSlug: 'demo',
      context: 'tenant_login',
      reason: 'user_not_found',
    });
  });

  it('clears failed attempts after successful tenant login', async () => {
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);
    tenantsService.findActiveBySlug.mockResolvedValue({
      slug: 'demo',
      schema_name: 'tenant_demo',
    });
    dataSource.query.mockResolvedValueOnce([
      {
        id: 10,
        email: 'user@email.com',
        password: 'hash',
        name: 'User',
        role: 'INQUILINO',
        is_active: true,
        created_at: new Date(),
        updated_at: new Date(),
      },
    ]);

    const user = await service.validateUser(
      'user@email.com',
      'valid-password',
      'demo',
    );

    expect(user.id).toBe(10);
    expect(authSecurityService.recordSuccess).toHaveBeenCalledWith({
      email: 'user@email.com',
      tenantSlug: 'demo',
      context: 'tenant_login',
      userId: 10,
    });
  });

  it('returns generic response for unknown password reset email', async () => {
    dataSource.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    const result = await service.requestPasswordReset('missing@email.com');

    expect(result.message).toContain('Si el correo existe');
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT * FROM public.tenant WHERE is_active = true ORDER BY id ASC',
    );
  });

  it('resets password with a valid token and marks it as used', async () => {
    const token = 'valid-reset-token';
    const tokenHash = createHash('sha256').update(token).digest('hex');
    const manager = { query: jest.fn().mockResolvedValue(undefined) };

    (bcrypt.hash as jest.Mock).mockResolvedValueOnce('new-hash');
    dataSource.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          id: 77,
          tenant_slug: 'demo',
          tenant_schema: 'tenant_demo',
          user_id: 10,
          expires_at: new Date(Date.now() + 60000),
          used_at: null,
        },
      ])
      .mockResolvedValueOnce([{ role: 'PROPIETARIO' }]);
    dataSource.transaction.mockImplementationOnce(
      async (callback: (value: typeof manager) => Promise<void>) =>
        callback(manager),
    );

    const result = await service.resetPassword(token, 'NewPassword123');

    expect(result.message).toContain('actualizada');
    expect(result.role).toBe('PROPIETARIO');
    expect(result.tenantSlug).toBe('demo');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WHERE token_hash = $1'),
      [tokenHash],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "tenant_demo"."user"'),
      ['new-hash', 10],
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE public.password_reset_tokens'),
      [77],
    );
  });

  it('rejects invalid or expired reset tokens', async () => {
    dataSource.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([]);

    await expect(
      service.resetPassword('invalid-token', 'NewPassword123'),
    ).rejects.toThrow('Token de recuperacion invalido o vencido');
  });

  it('requires email MFA for admin login without issuing a JWT first', async () => {
    process.env.ADMIN_EMAIL_MFA_ENABLED = 'true';
    (bcrypt.compare as jest.Mock).mockResolvedValueOnce(true);

    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 1,
          slug: 'demo',
          schema_name: 'tenant_demo',
          is_active: true,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 10,
          email: 'admin@test.com',
          password: 'hash',
          name: 'Admin',
          role: 'ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    const result = await service.loginAdmin('admin@test.com', 'valid-password');

    expect('mfa_required' in result && result.mfa_required).toBe(true);
    expect(jwtService.sign).not.toHaveBeenCalled();
    expect(authSecurityService.recordSuccess).not.toHaveBeenCalled();
  });

  it('issues admin JWT only after a valid MFA code', async () => {
    const code = '123456';
    const codeHash = createHash('sha256').update(code).digest('hex');

    dataSource.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce([
        {
          id: 55,
          email: 'admin@test.com',
          tenant_slug: 'demo',
          tenant_schema: 'tenant_demo',
          user_id: 10,
          code_hash: codeHash,
          attempts: 0,
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 10,
          email: 'admin@test.com',
          password: 'hash',
          name: 'Admin',
          role: 'ADMIN',
          is_active: true,
          created_at: new Date(),
          updated_at: new Date(),
        },
      ])
      .mockResolvedValueOnce(undefined);

    const result = await service.verifyAdminMfa('challenge-123', code);

    expect(result.access_token).toBe('signed-token');
    expect(jwtService.sign).toHaveBeenCalledWith(
      expect.objectContaining({
        email: 'admin@test.com',
        tenantSlug: 'demo',
        mfaVerified: true,
      }),
    );
    expect(authSecurityService.recordSuccess).toHaveBeenCalledWith({
      email: 'admin@test.com',
      tenantSlug: 'admin',
      context: 'admin_login',
      userId: 10,
    });
  });
});
