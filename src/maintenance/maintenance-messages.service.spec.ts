import { Test, TestingModule } from '@nestjs/testing';
import { ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { MaintenanceMessagesService } from './maintenance-messages.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { NotificationsService } from '../notifications/notifications.service';

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

  beforeEach(async () => {
    query = jest.fn();
    queryRunner = makeQueryRunner();
    createQueryRunner = jest.fn().mockReturnValue(queryRunner);
    lookupService = { findOne: jest.fn() };
    notificationsService = { createForUser: jest.fn() };

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
        {
          provide: NotificationsService,
          useValue: notificationsService,
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
});
