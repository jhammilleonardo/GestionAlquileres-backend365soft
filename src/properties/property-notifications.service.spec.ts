import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { PropertyNotificationsService } from './property-notifications.service';

describe('PropertyNotificationsService', () => {
  let service: PropertyNotificationsService;
  let dataSource: { query: jest.Mock };
  let notificationsService: {
    createForUser: jest.Mock;
    createForUserInSchema: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    dataSource = {
      query: jest.fn().mockResolvedValue([{ id: 7 }]),
    };
    notificationsService = {
      createForUser: jest.fn().mockResolvedValue(undefined),
      createForUserInSchema: jest.fn().mockResolvedValue(undefined),
    };

    service = new PropertyNotificationsService(
      dataSource as unknown as DataSource,
      notificationsService as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('sends available notifications using an explicit tenant schema', async () => {
    await service.notifyStatusChange(
      { id: 10, title: 'Casa Central', status: 'OCUPADO' },
      'DISPONIBLE',
      'tenant_acme',
      'acme',
    );

    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT id FROM "tenant_acme"."user" WHERE role = \'ADMIN\'',
    );
    expect(notificationsService.createForUserInSchema).toHaveBeenCalledWith(
      'tenant_acme',
      7,
      NotificationEventType.PROPERTY_AVAILABLE,
      'Propiedad disponible',
      'La propiedad Casa Central ahora está disponible',
      {
        property_id: 10,
        property_title: 'Casa Central',
        old_status: 'OCUPADO',
        new_status: 'DISPONIBLE',
      },
      'acme',
    );
    expect(notificationsService.createForUser).not.toHaveBeenCalled();
  });

  it('logs notification failures without throwing', async () => {
    dataSource.query.mockRejectedValueOnce(new Error('notification db failed'));

    await expect(
      service.notifyStatusChange(
        { id: 10, title: 'Casa Central', status: 'OCUPADO' },
        'INACTIVO',
        'tenant_acme',
        'acme',
      ),
    ).resolves.toBeUndefined();

    expect(loggerErrorSpy).toHaveBeenCalled();
  });
});
