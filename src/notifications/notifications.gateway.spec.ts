import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Socket } from 'socket.io';
import { NotificationsGateway } from './notifications.gateway';

describe('NotificationsGateway', () => {
  let gateway: NotificationsGateway;
  let jwtService: { verify: jest.Mock };
  let configService: { get: jest.Mock };
  let loggerLogSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

    jwtService = { verify: jest.fn() };
    configService = { get: jest.fn().mockReturnValue('test-jwt-secret') };

    gateway = new NotificationsGateway(
      jwtService as unknown as JwtService,
      configService as unknown as ConfigService,
    );
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  type TestSocket = Socket & {
    data: Record<string, unknown>;
    join: jest.Mock<Promise<void>, [string]>;
    disconnect: jest.Mock<Socket, [boolean?]>;
  };

  function createClient(overrides?: Partial<TestSocket>): TestSocket {
    return {
      id: 'socket-1',
      handshake: { auth: {}, headers: {}, query: {} },
      data: {},
      join: jest.fn().mockResolvedValue(undefined),
      disconnect: jest.fn(),
      ...overrides,
    } as unknown as TestSocket;
  }

  const validPayload = {
    sub: 9,
    email: 'admin@test.com',
    role: 'ADMIN',
    tenantSlug: 'demo',
  };

  describe('handleConnection', () => {
    it('debe autenticar y unirse a los rooms del tenant y usuario', () => {
      jwtService.verify.mockReturnValue(validPayload);

      const client = createClient({
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

    it('debe conectar sin tenantSlug en handshake usando el slug del JWT', () => {
      jwtService.verify.mockReturnValue({
        ...validPayload,
        tenantSlug: 'acme',
        sub: 7,
      });

      const client = createClient({
        handshake: { auth: { token: 'token-abc' }, headers: {}, query: {} },
      });

      gateway.handleConnection(client);

      expect(client.disconnect).not.toHaveBeenCalled();
      expect(client.join).toHaveBeenCalledWith('tenant:acme');
      expect(client.join).toHaveBeenCalledWith('tenant:acme:user:7');
    });

    it('debe autenticar con token en el header Authorization', () => {
      jwtService.verify.mockReturnValue(validPayload);

      const client = createClient({
        handshake: {
          auth: {},
          headers: { authorization: 'Bearer header-token' },
          query: {},
        },
      });

      gateway.handleConnection(client);

      expect(jwtService.verify).toHaveBeenCalledWith('header-token', {
        secret: 'test-jwt-secret',
      });
      expect(client.disconnect).not.toHaveBeenCalled();
    });

    it('debe rechazar la conexión si no se provee token', () => {
      const client = createClient();

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('debe rechazar la conexión si el JWT es inválido', () => {
      jwtService.verify.mockImplementation(() => {
        throw new Error('invalid signature');
      });

      const client = createClient({
        handshake: { auth: { token: 'bad-token' }, headers: {}, query: {} },
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('debe rechazar la conexión si el payload del JWT no tiene los campos requeridos', () => {
      jwtService.verify.mockReturnValue({ sub: 1 }); // sin email, role, tenantSlug

      const client = createClient({
        handshake: { auth: { token: 'partial-token' }, headers: {}, query: {} },
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('debe rechazar la conexión si el tenant del handshake no coincide con el del JWT', () => {
      jwtService.verify.mockReturnValue(validPayload); // tenantSlug: 'demo'

      const client = createClient({
        handshake: {
          auth: { token: 'token-123', tenantSlug: 'otro-tenant' },
          headers: {},
          query: {},
        },
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });

    it('debe rechazar la conexión si el userId no es un número válido', () => {
      jwtService.verify.mockReturnValue({
        ...validPayload,
        sub: 'no-es-numero',
      });

      const client = createClient({
        handshake: { auth: { token: 'token-123' }, headers: {}, query: {} },
      });

      gateway.handleConnection(client);

      expect(client.disconnect).toHaveBeenCalledWith(true);
      expect(client.join).not.toHaveBeenCalled();
    });
  });

  describe('emitTenantEvent', () => {
    it('debe emitir el evento al room del tenant', () => {
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
  });

  describe('emitUserEvent', () => {
    it('debe emitir el evento al room del usuario', () => {
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
});
