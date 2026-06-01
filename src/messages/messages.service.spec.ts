import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { MessagesService } from './messages.service';

describe('MessagesService', () => {
  let service: MessagesService;
  let dataSource: { query: jest.Mock<Promise<unknown>, [string, unknown[]?]> };

  beforeEach(async () => {
    dataSource = { query: jest.fn<Promise<unknown>, [string, unknown[]?]>() };
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MessagesService,
        { provide: getDataSourceToken(), useValue: dataSource },
      ],
    }).compile();
    service = module.get<MessagesService>(MessagesService);
  });

  it('send inserta el mensaje y devuelve la fila', async () => {
    const row = { id: 1, sender_id: 1, recipient_id: 2, body: 'Hola' };
    dataSource.query.mockResolvedValueOnce([row]);

    const result = await service.send(1, 2, 'Hola');

    expect(result).toEqual(row);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('INSERT INTO internal_messages');
    expect(params).toEqual([1, 2, 'Hola']);
  });

  it('getThread devuelve los mensajes y marca como leídos los recibidos', async () => {
    const messages = [{ id: 1, sender_id: 2, recipient_id: 1, body: 'Hi' }];
    dataSource.query
      .mockResolvedValueOnce(messages) // SELECT conversación
      .mockResolvedValueOnce(undefined); // UPDATE is_read

    const result = await service.getThread(1, 2);

    expect(result).toEqual(messages);
    expect(dataSource.query).toHaveBeenCalledTimes(2);
    expect(dataSource.query.mock.calls[1][0]).toContain(
      'UPDATE internal_messages SET is_read',
    );
    expect(dataSource.query.mock.calls[1][1]).toEqual([1, 2]);
  });

  it('broadcast inserta a inquilinos/propietarios y cuenta los destinatarios', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }, { id: 3 }]);

    const result = await service.broadcast(1, 'Aviso');

    expect(result).toEqual({ count: 3 });
    const [sql] = dataSource.query.mock.calls[0];
    expect(sql).toContain("u.role IN ('INQUILINO', 'PROPIETARIO')");
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
      ['INQUILINO', 'PROPIETARIO'],
    ]);
  });

  it('getRecipients de un INQUILINO devuelve admins y empleados', async () => {
    dataSource.query.mockResolvedValueOnce([
      { id: 1, name: 'Admin', role: 'ADMIN' },
    ]);
    await service.getRecipients('INQUILINO');
    expect(dataSource.query.mock.calls[0][1]).toEqual([['ADMIN', 'EMPLEADO']]);
  });

  it('getThreads consulta la bandeja del usuario', async () => {
    dataSource.query.mockResolvedValueOnce([]);
    await service.getThreads(1);
    const [sql, params] = dataSource.query.mock.calls[0];
    expect(sql).toContain('FROM internal_messages');
    expect(params).toEqual([1]);
  });
});
