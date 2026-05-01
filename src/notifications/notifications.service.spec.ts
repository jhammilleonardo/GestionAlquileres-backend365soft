import { DataSource } from 'typeorm';
import { tenantConnectionStore } from '../common/tenant/tenant-connection.store';
import { NotificationEventType } from './dto/create-notification.dto';
import { NotificationsGateway } from './notifications.gateway';
import { NotificationsService } from './notifications.service';

describe('NotificationsService realtime events', () => {
  let service: NotificationsService;
  let dataSource: { query: jest.Mock };
  let notificationsGateway: { emitTenantEvent: jest.Mock };

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    notificationsGateway = {
      emitTenantEvent: jest.fn(),
    };

    service = new NotificationsService(
      dataSource as unknown as DataSource,
      notificationsGateway as unknown as NotificationsGateway,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('emits payment.received when creating a payment notification', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 1 }]);

    await service.createForUser(
      10,
      NotificationEventType.PAYMENT_CREATED,
      'Pago recibido',
      'Se registro un nuevo pago',
      { paymentId: 99 },
      'tenant-demo',
    );

    expect(notificationsGateway.emitTenantEvent).toHaveBeenCalledWith(
      'tenant-demo',
      'payment.received',
      expect.objectContaining({
        user_id: 10,
        title: 'Pago recibido',
        message: 'Se registro un nuevo pago',
      }),
    );
  });

  it('emits maintenance.updated for notifyAdmins with maintenance status changes', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2 }]);

    await service.notifyAdmins(
      [1, 2],
      NotificationEventType.MAINTENANCE_STATUS_CHANGED,
      'Mantenimiento actualizado',
      'La solicitud cambio de estado',
      { requestId: 12 },
      'tenant-demo',
    );

    expect(notificationsGateway.emitTenantEvent).toHaveBeenCalledWith(
      'tenant-demo',
      'maintenance.updated',
      expect.objectContaining({
        user_ids: [1, 2],
        title: 'Mantenimiento actualizado',
      }),
    );
  });

  it('resolves tenant slug from tenant context when not provided', async () => {
    jest.spyOn(tenantConnectionStore, 'getStore').mockReturnValue({
      queryRunner: null,
      schemaName: 'tenant_demo_schema',
    });

    dataSource.query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([{ slug: 'tenant-demo' }]);

    await service.createForUser(
      15,
      NotificationEventType.MAINTENANCE_REQUEST_CREATED,
      'Nueva solicitud',
      'Se creo una solicitud de mantenimiento',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('SELECT slug FROM public.tenant'),
      ['tenant_demo_schema'],
    );
    expect(notificationsGateway.emitTenantEvent).toHaveBeenCalledWith(
      'tenant-demo',
      'maintenance.new',
      expect.objectContaining({ user_id: 15 }),
    );
  });

  it('does not emit realtime event for non-mapped notification types', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 30 }]);

    await service.createForUser(
      15,
      NotificationEventType.USER_REGISTERED,
      'Usuario registrado',
      'Se registro un usuario',
      undefined,
      'tenant-demo',
    );

    expect(notificationsGateway.emitTenantEvent).not.toHaveBeenCalled();
  });
});
