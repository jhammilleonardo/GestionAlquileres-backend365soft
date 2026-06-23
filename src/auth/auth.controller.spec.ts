import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { RefreshTokenService } from './refresh-token.service';

describe('AuthController', () => {
  let controller: AuthController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: {
            login: jest.fn(),
            register: jest.fn(),
            registerAdmin: jest.fn(),
            loginTenant: jest.fn(),
            getProfile: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: { sign: jest.fn(), decode: jest.fn() },
        },
        {
          provide: RefreshTokenService,
          useValue: {
            issue: jest.fn(),
            consume: jest.fn(),
            revoke: jest.fn(),
          },
        },
      ],
    }).compile();

    controller = module.get<AuthController>(AuthController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
