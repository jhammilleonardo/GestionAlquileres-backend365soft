import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { MaintenanceCreationService } from './maintenance-creation.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';

const makeQueryRunner = () => ({
  isTransactionActive: false,
  connect: jest.fn().mockResolvedValue(undefined),
  startTransaction: jest.fn().mockResolvedValue(undefined),
  commitTransaction: jest.fn().mockResolvedValue(undefined),
  rollbackTransaction: jest.fn().mockResolvedValue(undefined),
  release: jest.fn().mockResolvedValue(undefined),
  query: jest.fn(),
});

describe('MaintenanceCreationService', () => {
  let service: MaintenanceCreationService;
  let dataSourceQuery: jest.Mock;
  let createQueryRunner: jest.Mock;
  let queryRunner: ReturnType<typeof makeQueryRunner>;
  let notificationsService: { createForUser: jest.Mock };
  let lookupService: { findOne: jest.Mock };

  beforeEach(async () => {
    dataSourceQuery = jest.fn();
    queryRunner = makeQueryRunner();
    createQueryRunner = jest.fn().mockReturnValue(queryRunner);
    notificationsService = { createForUser: jest.fn() };
    lookupService = { findOne: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceCreationService,
        {
          provide: DataSource,
          useValue: { query: dataSourceQuery, createQueryRunner },
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: MaintenanceLookupService,
          useValue: lookupService,
        },
      ],
    }).compile();

    service = module.get(MaintenanceCreationService);
  });

  it('crea solicitud y adjuntos dentro de una transaccion y notifica despues', async () => {
    dataSourceQuery
      .mockResolvedValueOnce([
        {
          id: 2,
          tenant_id: 10,
          property_id: 7,
          contract_number: 'C-1',
          status: ContractStatus.ACTIVO,
        },
      ])
      .mockResolvedValueOnce([{ id: 7, title: 'Casa' }])
      .mockResolvedValueOnce([{ name: 'Ana' }]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 99,
          ticket_number: 'MNT-2026-ABC123',
          category: 'PLOMERIA',
          priority: 'NORMAL',
        },
      ])
      .mockResolvedValueOnce([]);
    lookupService.findOne.mockResolvedValueOnce({ id: 99 });

    await expect(
      service.create(
        {
          request_type: 'MAINTENANCE',
          category: 'PLOMERIA',
          title: 'Fuga',
          description: 'Fuga en baño',
          files: ['/a.pdf'],
        },
        10,
        2,
        20,
      ),
    ).resolves.toEqual({ id: 99 });

    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO maintenance_attachments'),
      expect.arrayContaining([99, '/a.pdf']),
    );
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      20,
      expect.any(String),
      expect.any(String),
      expect.stringContaining('Ana'),
      expect.objectContaining({ maintenance_request_id: 99 }),
    );
  });

  it('hace rollback si falla guardar adjuntos', async () => {
    dataSourceQuery.mockResolvedValueOnce([
      {
        id: 2,
        tenant_id: 10,
        property_id: 7,
        contract_number: 'C-1',
        status: ContractStatus.ACTIVO,
      },
    ]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 99,
          ticket_number: 'MNT-2026-ABC123',
          category: 'PLOMERIA',
          priority: 'NORMAL',
        },
      ])
      .mockRejectedValueOnce(new Error('disk failed'));

    await expect(
      service.create(
        {
          request_type: 'MAINTENANCE',
          category: 'PLOMERIA',
          title: 'Fuga',
          description: 'Fuga en baño',
          files: ['/a.pdf'],
        },
        10,
        2,
        20,
      ),
    ).rejects.toThrow('disk failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(notificationsService.createForUser).not.toHaveBeenCalled();
  });

  it('crea solicitud desde una reserva confirmada sin contrato activo', async () => {
    dataSourceQuery
      .mockResolvedValueOnce([
        {
          id: 55,
          tenant_id: 10,
          property_id: 7,
          unit_id: 3,
          status: 'confirmed',
        },
      ])
      .mockResolvedValueOnce([{ id: 7, title: 'Casa' }])
      .mockResolvedValueOnce([{ name: 'Ana' }]);
    queryRunner.query.mockResolvedValueOnce([
      {
        id: 101,
        ticket_number: 'MNT-2026-RES001',
        category: 'GENERAL',
        priority: 'NORMAL',
      },
    ]);
    lookupService.findOne.mockResolvedValueOnce({ id: 101 });

    await expect(
      service.create(
        {
          request_type: 'GENERAL',
          title: 'Consulta de estadia',
          description: 'Necesito ayuda con la reserva',
          reservation_id: 55,
        },
        10,
        undefined,
        20,
      ),
    ).resolves.toEqual({ id: 101 });

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('reservation_id'),
      expect.arrayContaining([10, 7, null, 55, 20]),
    );
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      20,
      expect.any(String),
      expect.any(String),
      expect.stringContaining('Ana'),
      expect.objectContaining({ reservation_id: 55, contract_id: null }),
    );
  });
});
