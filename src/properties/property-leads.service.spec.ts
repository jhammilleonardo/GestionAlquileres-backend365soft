import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { PropertyLeadsService } from './property-leads.service';

describe('PropertyLeadsService', () => {
  let service: PropertyLeadsService;
  let dataSource: {
    query: jest.Mock;
  };
  let notificationsService: {
    createForUserInSchema: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
    dataSource = {
      query: jest.fn(),
    };
    notificationsService = {
      createForUserInSchema: jest.fn().mockResolvedValue({ id: 1 }),
    };
    service = new PropertyLeadsService(
      dataSource as unknown as DataSource,
      notificationsService as unknown as NotificationsService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('creates leads and notifications using schema-qualified tenant tables', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 20, title: 'Casa Central' }])
      .mockResolvedValueOnce([
        {
          id: 7,
          property_id: 20,
          name: 'Ana',
          email: 'ana@example.com',
          phone: null,
          message: 'Quiero informacion',
          inquiry_type: 'general',
          availability: null,
          created_at: new Date('2026-05-16T00:00:00.000Z'),
          status: 'PENDING',
        },
      ])
      .mockResolvedValueOnce([{ id: 1 }]);

    await service.createPropertyContact(
      20,
      {
        name: 'Ana',
        email: 'ana@example.com',
        phone: '+59170000000',
        message: 'Quiero informacion',
      },
      'acme',
      '127.0.0.1',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id, title FROM "tenant_acme".properties WHERE id = $1',
      [20],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO "tenant_acme".property_leads'),
      [
        20,
        'Ana',
        'ana@example.com',
        '+59170000000',
        'Quiero informacion',
        'general',
        null,
        'PENDING',
        '127.0.0.1',
      ],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      4,
      'SELECT id FROM "tenant_acme"."user" WHERE role = \'ADMIN\' AND is_active = true',
    );
    expect(notificationsService.createForUserInSchema).toHaveBeenCalledWith(
      'tenant_acme',
      1,
      NotificationEventType.PROPERTY_LEAD_RECEIVED,
      'New Lead: Ana',
      expect.stringContaining('Casa Central'),
      expect.objectContaining({
        property_id: 20,
        lead_email: 'ana@example.com',
      }),
      'acme',
    );
  });
});
