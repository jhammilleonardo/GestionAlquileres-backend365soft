import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { JwtService } from '@nestjs/jwt';
import { TenantsService } from '../tenants/tenants.service';
import { TenantAdminIndexService } from '../tenants/tenant-admin-index.service';
import { NotificationsService } from '../notifications/notifications.service';
import { getDataSourceToken } from '@nestjs/typeorm';
import { AuthSecurityService } from './auth-security.service';
import * as bcrypt from 'bcrypt';

jest.mock('bcrypt', () => ({
  compare: jest.fn(),
  hash: jest.fn(),
}));

describe('AuthService', () => {
  let service: AuthService;
  let tenantsService: { findBySlug: jest.Mock; findActiveBySlug: jest.Mock };
  let dataSource: { query: jest.Mock };
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
    dataSource = { query: jest.fn() };
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
          useValue: { sign: jest.fn(), verify: jest.fn() },
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
});
