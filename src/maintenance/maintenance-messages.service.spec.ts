import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaintenanceMessageNotificationsService } from './maintenance-message-notifications.service';
import { MaintenanceMessagesService } from './maintenance-messages.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import { StorageService } from '../common/storage/storage.service';

const makeQueryRunner = () => ({
  isTransactionActive: false,
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
});

describe('MaintenanceMessagesService', () => {
  let service: MaintenanceMessagesService;
  let query: jest.Mock;
  let createQueryRunner: jest.Mock;
  let queryRunner: ReturnType<typeof makeQueryRunner>;
  let lookupService: { findOne: jest.Mock };
  let notificationsService: { createForUser: jest.Mock };
  let storageService: {
    persistUploadedFile: jest.Mock;
    buildStoragePath: jest.Mock;
    toRoutePath: jest.Mock;
    deleteStoredFile: jest.Mock;
  };

  beforeEach(async () => {
    query = jest.fn();
    queryRunner = makeQueryRunner();
    createQueryRunner = jest.fn().mockReturnValue(queryRunner);
    lookupService = { findOne: jest.fn() };
    notificationsService = { createForUser: jest.fn() };
    storageService = {
      persistUploadedFile: jest.fn(),
      buildStoragePath: jest.fn(),
      toRoutePath: jest.fn(),
      deleteStoredFile: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceMessagesService,
        {
          provide: DataSource,
          useValue: { query, createQueryRunner },
        },
        {
          provide: MaintenanceLookupService,
          useValue: lookupService,
        },
        MaintenanceMessageNotificationsService,
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: StorageService,
          useValue: storageService,
        },
      ],
    }).compile();

    service = module.get(MaintenanceMessagesService);
  });

  it('rechaza mensajes del inquilino cuando la solicitud esta cerrada', async () => {
    lookupService.findOne.mockResolvedValueOnce({
      id: 1,
      tenant_id: 10,
      status: 'COMPLETED',
    });

    await expect(
      service.addMessage(1, { message: 'hola' }, 10),
    ).rejects.toThrow(ForbiddenException);
  });

  it('crea mensaje, vincula archivo faltante y notifica al admin asignado', async () => {
    lookupService.findOne
      .mockResolvedValueOnce({
        id: 1,
        tenant_id: 10,
        assigned_to: 20,
        status: 'NEW',
        ticket_number: 'MNT-1',
      })
      .mockResolvedValueOnce({
        id: 1,
        tenant_id: 10,
        assigned_to: 20,
        status: 'NEW',
        ticket_number: 'MNT-1',
      });
    queryRunner.query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    query
      .mockResolvedValueOnce([{ name: 'Luis' }])
      .mockResolvedValueOnce([{ id: 5, attachments: [] }]);

    await expect(
      service.addMessage(1, { message: 'mensaje', files: ['/a.pdf'] }, 10),
    ).resolves.toEqual({ id: 5, attachments: [] });

    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      20,
      expect.any(String),
      expect.any(String),
      expect.stringContaining('Luis'),
      expect.objectContaining({ maintenance_request_id: 1 }),
    );
  });

  it('no duplica adjuntos cuando UPDATE RETURNING usa respuesta estructurada', async () => {
    lookupService.findOne
      .mockResolvedValueOnce({
        id: 1,
        tenant_id: 10,
        assigned_to: 20,
        status: 'NEW',
        ticket_number: 'MNT-1',
      })
      .mockResolvedValueOnce({
        id: 1,
        tenant_id: 10,
        assigned_to: 20,
        status: 'NEW',
        ticket_number: 'MNT-1',
      });
    queryRunner.query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([[{ id: 8 }], 1]);
    query
      .mockResolvedValueOnce([{ name: 'Luis' }])
      .mockResolvedValueOnce([{ id: 5, attachments: [{ id: 8 }] }]);

    await expect(
      service.addMessage(1, { message: 'mensaje', files: ['/a.pdf'] }, 10),
    ).resolves.toEqual({ id: 5, attachments: [{ id: 8 }] });

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('hace rollback si falla vincular adjuntos', async () => {
    lookupService.findOne.mockResolvedValueOnce({
      id: 1,
      tenant_id: 10,
      assigned_to: 20,
      status: 'NEW',
      ticket_number: 'MNT-1',
    });
    queryRunner.query
      .mockResolvedValueOnce([{ id: 5 }])
      .mockRejectedValueOnce(new Error('attach failed'));

    await expect(
      service.addMessage(1, { message: 'mensaje', files: ['/a.pdf'] }, 10),
    ).rejects.toThrow('attach failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(notificationsService.createForUser).not.toHaveBeenCalled();
  });

  it('borra archivos persistidos si falla registrar el adjunto en base de datos', async () => {
    storageService.buildStoragePath.mockReturnValue(
      'storage/maintenance/acme/1/a.pdf',
    );
    storageService.persistUploadedFile.mockResolvedValue(
      'storage/maintenance/acme/1/a.pdf',
    );
    storageService.toRoutePath.mockReturnValue(
      '/storage/maintenance/acme/1/a.pdf',
    );
    queryRunner.query.mockRejectedValueOnce(new Error('insert failed'));

    await expect(
      service.saveUploadedFiles(
        1,
        [
          {
            filename: 'a.pdf',
            originalname: 'a.pdf',
            size: 123,
          } as Express.Multer.File,
        ],
        10,
        'acme',
      ),
    ).rejects.toThrow('insert failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(storageService.deleteStoredFile).toHaveBeenCalledWith(
      'storage/maintenance/acme/1/a.pdf',
    );
  });
});
