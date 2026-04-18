import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { TenantsService } from '../tenants/tenants.service';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken } from '@nestjs/typeorm';
import { NotificationsService } from '../notifications/notifications.service';

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: TenantsService, useValue: { findBySlug: jest.fn() } },
        { provide: JwtService, useValue: { sign: jest.fn() } },
        { provide: getDataSourceToken(), useValue: { query: jest.fn() } },
        { provide: NotificationsService, useValue: { createForUser: jest.fn() } },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
