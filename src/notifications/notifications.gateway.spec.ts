import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };

  beforeEach(() => {
    jwtService = {
      verify: jest.fn(),
    };
    configService = {
      get: jest.fn().mockReturnValue('test-jwt-secret'),
    };

    gateway = new NotificationsGateway(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  function createSocketClient(overrides?: Partial<any>) {
    return {
      id: 'socket-1',
      handshake: {
        auth: {},
        headers: {},
        query: {},
      },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      ...overrides,
    };
  }

  it('authenticates and joins tenant/user rooms', () => {
    jwtService.verify.mockReturnValue({
      sub: 9,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'demo',
    });

    const client = createSocketClient({
      handshake: {
        auth: { token: 'token-123', tenantSlug: 'demo' },
        headers: {},
        query: {},
      },
    });

    gateway.handleConnection(client);

    expect(client.disconnect).not.toHaveBeenCalled();
    expect(client.join).toHaveBeenCalledWith('tenant:demo');
    expect(client.join).toHaveBeenCalledWith('tenant:demo:user:9');
    expect(client.data).toMatchObject({
      userId: 9,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'demo',
    });
  });

  it('rejects socket connection when tenant does not match JWT', () => {
    jwtService.verify.mockReturnValue({
      sub: 9,
      email: 'admin@test.com',
      role: 'ADMIN',
      tenantSlug: 'demo',
    });

    const client = createSocketClient({
      handshake: {
        auth: { token: 'token-123', tenantSlug: 'other-tenant' },
        headers: {},
        query: {},
      },
    });

    gateway.handleConnection(client);

    expect(client.disconnect).toHaveBeenCalledWith(true);
    expect(client.join).not.toHaveBeenCalled();
  });

  it('emits tenant-scoped events to the tenant room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    Object.defineProperty(gateway, 'server', {
      value: { to },
      writable: true,
    });

    gateway.emitTenantEvent('demo', 'payment.received', { paymentId: 100 });

    expect(to).toHaveBeenCalledWith('tenant:demo');
    expect(emit).toHaveBeenCalledWith('payment.received', { paymentId: 100 });
  });

  it('emits user-scoped events to the user room', () => {
    const emit = jest.fn();
    const to = jest.fn().mockReturnValue({ emit });
    Object.defineProperty(gateway, 'server', {
      value: { to },
      writable: true,
    });

    gateway.emitUserEvent('demo', 25, 'message.new', { threadId: 7 });

    expect(to).toHaveBeenCalledWith('tenant:demo:user:25');
    expect(emit).toHaveBeenCalledWith('message.new', { threadId: 7 });
  });
});
