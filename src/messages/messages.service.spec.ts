import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';
import { StorageService } from '../common/storage/storage.service';
import { NotificationsGateway } from '../notifications/notifications.gateway';

type QueryRunnerMock = {
  query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  isTransactionActive: boolean;
  connect: jest.Mock<Promise<void>, []>;
  startTransaction: jest.Mock<Promise<void>, []>;
  commitTransaction: jest.Mock<Promise<void>, []>;
  rollbackTransaction: jest.Mock<Promise<void>, []>;
  release: jest.Mock<Promise<void>, []>;
};

describe('MessagesService', () => {
  let service: MessagesService;
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
    createQueryRunner: jest.Mock<QueryRunnerMock, []>;
  };
  let queryRunner: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };
  let gateway: {
    emitUserEvent: jest.Mock<
      void,
      Parameters<NotificationsGateway['emitUserEvent']>
    >;
  };

  beforeEach(async () => {
    queryRunner = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    const runner: QueryRunnerMock = {
      ...queryRunner,
      isTransactionActive: false,
      connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      startTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      commitTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      rollbackTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
    };
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
      createQueryRunner: jest.fn<QueryRunnerMock, []>(() => runner),
    };
    gateway = {
      emitUserEvent: jest.fn<
        void,
        Parameters<NotificationsGateway['emitUserEvent']>
      >(),
    };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getDataSourceToken(), useValue: dataSource },
        { provide: StorageService, useValue: {} },
        { provide: NotificationsGateway, useValue: gateway },
      ],
    }).compile();
    service = module.get<MessagesService>(MessagesService);
  });

  it('send inserta el mensaje y devuelve la fila con adjuntos', async () => {
    const row = {
      id: 1,
      sender_id: 1,
      recipient_id: 2,
      body: 'Hola',
      attachments: [],
    };
    // El INSERT corre dentro de la transacción (queryRunner)…
    queryRunner.query.mockResolvedValueOnce([{ id: 1 }]);
    dataSource.query.mockResolvedValueOnce([{ role: 'INQUILINO' }]);
    // …y la relectura con adjuntos usa dataSource.query.
    dataSource.query.mockResolvedValueOnce([row]);

    const result = await service.send(1, 'ADMIN', 2, 'Hola');

    expect(result).toEqual(row);
  });

  it('send emite evento realtime al remitente y destinatario cuando recibe tenantSlug', async () => {
    const row = {
      id: 1,
      sender_id: 1,
      recipient_id: 2,
      body: 'Hola',
      attachments: [],
    };
    queryRunner.query.mockResolvedValueOnce([{ id: 1 }]);
    dataSource.query.mockResolvedValueOnce([{ role: 'INQUILINO' }]);
    dataSource.query.mockResolvedValueOnce([row]);

    await service.send(1, 'ADMIN', 2, 'Hola', [], 'test2');

    expect(gateway.emitUserEvent).toHaveBeenCalledWith(
      'test2',
      2,
      'message.new',
      expect.objectContaining({ messageId: 1, peerUserId: 1 }),
    );
    expect(gateway.emitUserEvent).toHaveBeenCalledWith(
      'test2',
      1,
      'message.new',
      expect.objectContaining({ messageId: 1, peerUserId: 2 }),
    );
  });

  it('send bloquea conversaciones entre dos usuarios externos', async () => {
    dataSource.query.mockResolvedValueOnce([{ role: 'PROPIETARIO' }]);

    await expect(service.send(1, 'INQUILINO', 2, 'Hola')).rejects.toThrow(
      'Destinatario no permitido',
    );
    expect(queryRunner.query).not.toHaveBeenCalled();
  });

  it('getThread devuelve los mensajes y marca como leídos los recibidos', async () => {
    const messages = [{ id: 1, sender_id: 2, recipient_id: 1, body: 'Hi' }];
    dataSource.query
      .mockResolvedValueOnce([{ role: 'ADMIN' }]) // validación de destinatario
      .mockResolvedValueOnce(messages) // SELECT conversación
      .mockResolvedValueOnce(undefined); // UPDATE is_read

    const result = await service.getThread(1, 'INQUILINO', 2);

    expect(result).toEqual(messages);
    expect(dataSource.query).toHaveBeenCalledTimes(3);
    expect(dataSource.query.mock.calls[2][0]).toContain(
      'UPDATE internal_messages SET is_read',
    );
    expect(dataSource.query.mock.calls[2][1]).toEqual([1, 2]);
  });

  it('broadcast inserta a inquilinos/propietarios y cuenta los destinatarios', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.broadcast(1, 'ADMIN', 'Aviso');

    expect(result).toEqual({ count: 3 });
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("u.role IN ('INQUILINO', 'PROPIETARIO', 'VENDOR')");
  });

  it('broadcast bloquea usuarios externos', async () => {
    await expect(service.broadcast(1, 'INQUILINO', 'Aviso')).rejects.toThrow(
      'No autorizado para envío masivo',
    );
    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('unreadCount devuelve el conteo de no leídos', async () => {
    dataSource.query.mockResolvedValueOnce([{ count: 4 }]);
    const result = await service.unreadCount(1);
    expect(result).toEqual({ count: 4 });
  });

  it('unreadCount devuelve 0 si no hay filas', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    const result = await service.unreadCount(1);
    expect(result).toEqual({ count: 0 });
  });

  it('getRecipients de un ADMIN devuelve inquilinos y propietarios', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 2, name: 'Ana', role: 'INQUILINO' },
    ]);
    await service.getRecipients('ADMIN');
    expect(dataSource.query.mock.calls[0][1]).toEqual([
      ['INQUILINO', 'PROPIETARIO', 'VENDOR'],
    ]);
  });

  it('getRecipients de un INQUILINO devuelve admins y empleados', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 1, name: 'Admin', role: 'ADMIN' },
    ]);
    await service.getRecipients('INQUILINO');
    expect(dataSource.query.mock.calls[0][1]).toEqual([
      ['ADMIN', 'SUPERADMIN', 'EMPLEADO'],
    ]);
  });

  it('getThreads consulta la bandeja del usuario', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await service.getThreads(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FROM internal_messages');
    expect(params).toEqual([1]);
  });
});
