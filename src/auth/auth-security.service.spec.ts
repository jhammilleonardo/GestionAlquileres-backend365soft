import { HttpException, HttpStatus } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { Test, TestingModule } from '@nestjs/testing';
import {
  AuthLoginContext,
  AuthSecurityEventType,
  AuthSecurityService,
} from './auth-security.service';

describe('AuthSecurityService', () => {
  let service: AuthSecurityService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthSecurityService,
        {
          provide: getDataSourceToken(),
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get(AuthSecurityService);
  });

  it('allows login when no active lock exists', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.assertLoginAllowed(
        'Admin@Email.com',
        'admin',
        AuthLoginContext.ADMIN,
      ),
    ).resolves.toBeUndefined();

    expect(dataSource.query).toHaveBeenCalledWith(expect.any(String), [
      'Admin@Email.com',
      'admin',
      AuthLoginContext.ADMIN,
    ]);
  });

  it('blocks login and records an event when account is locked', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        { failed_count: 5, locked_until: '2026-05-17T12:00:00.000Z' },
      ])
      .mockResolvedValueOnce([]);

    await expect(
      service.assertLoginAllowed(
        'admin@email.com',
        'admin',
        AuthLoginContext.ADMIN,
      ),
    ).rejects.toMatchObject<HttpException>({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      'admin@email.com',
      'admin',
      AuthLoginContext.ADMIN,
      AuthSecurityEventType.LOGIN_LOCKED,
      'account_locked',
      JSON.stringify({
        failed_count: 5,
        locked_until: '2026-05-17T12:00:00.000Z',
      }),
    ]);
  });

  it('records failed attempts and security events', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ failed_count: 3, locked_until: null }])
      .mockResolvedValueOnce([]);

    await service.recordFailure({
      email: 'user@email.com',
      tenantSlug: 'demo',
      context: AuthLoginContext.TENANT,
      reason: 'invalid_password',
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      'user@email.com',
      'demo',
      AuthLoginContext.TENANT,
      AuthSecurityEventType.LOGIN_FAILURE,
      'invalid_password',
      JSON.stringify({ failed_count: 3, locked_until: null }),
    ]);
  });

  it('clears failed attempts after successful login', async () => {
    dataSource.query.mockResolvedValue([]);

    await service.recordSuccess({
      email: 'user@email.com',
      tenantSlug: 'demo',
      context: AuthLoginContext.TENANT,
      userId: 10,
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(1, expect.any(String), [
      'user@email.com',
      'demo',
      AuthLoginContext.TENANT,
    ]);
    expect(dataSource.query).toHaveBeenNthCalledWith(2, expect.any(String), [
      'user@email.com',
      'demo',
      AuthLoginContext.TENANT,
      AuthSecurityEventType.LOGIN_SUCCESS,
      null,
      JSON.stringify({ user_id: 10 }),
    ]);
  });
});
