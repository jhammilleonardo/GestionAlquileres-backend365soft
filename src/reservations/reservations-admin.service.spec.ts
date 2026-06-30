import { Test, TestingModule } from '@nestjs/testing';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { NotFoundException, ConflictException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationsAdminService } from './reservations-admin.service';
import { ReservationNotificationService } from './reservation-notification.service';
import { ReservationRefundService } from './reservation-refund.service';
import { ReservationStatus } from './enums/reservation-status.enum';
import { ReservationAction } from './enums/reservation-action.enum';

// El search_path se valida en el run real; aquí el queryRunner está mockeado.
jest.mock('../common/tenant/tenant-search-path', () => ({
  applyTenantSearchPath: jest.fn().mockResolvedValue(undefined),
}));

describe('ReservationsAdminService', () => {
  let service: ReservationsAdminService;
  const mockQueryRunner = {
    connect: jest.fn(),
    startTransaction: jest.fn(),
    query: jest.fn(),
    commitTransaction: jest.fn(),
    rollbackTransaction: jest.fn(),
    release: jest.fn(),
  };
  const mockDataSource = {
    query: jest.fn(),
    createQueryRunner: jest.fn(() => mockQueryRunner),
  };
  const mockNotification = {
    notifyAdminsOfRequest: jest.fn(),
    notifyGuest: jest.fn(),
  };
  const mockRefund = {
    refundApprovedPayments: jest.fn().mockResolvedValue(0),
    refundAbsoluteAmount: jest.fn().mockResolvedValue(0),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsAdminService,
        { provide: AuditLogsService, useValue: { log: jest.fn() } },
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: ReservationNotificationService,
          useValue: mockNotification,
        },
        { provide: ReservationRefundService, useValue: mockRefund },
      ],
    }).compile();

    service = module.get<ReservationsAdminService>(ReservationsAdminService);
    jest.resetAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
  });

  // ─── findAll ────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('debe paginar y devolver total + data', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '3' }]) // COUNT
        .mockResolvedValueOnce([{ id: 1 }, { id: 2 }]); // SELECT

      const result = await service.findAll({ page: 1, limit: 20 });

      expect(result.total).toBe(3);
      expect(result.data).toHaveLength(2);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('debe construir el WHERE con los filtros provistos', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([{ count: '0' }])
        .mockResolvedValueOnce([]);

      await service.findAll({
        status: ReservationStatus.CONFIRMED,
        property_id: 3,
        unit_id: 7,
        checkin_from: '2026-05-01',
        checkin_to: '2026-05-31',
        page: 1,
        limit: 20,
      });

      const countCall = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      const countSql = countCall[0];
      const countParams = countCall[1];
      expect(countSql).toContain('WHERE');
      expect(countSql).toContain('r.status = $1');
      expect(countParams).toEqual([
        ReservationStatus.CONFIRMED,
        3,
        7,
        '2026-05-01',
        '2026-05-31',
      ]);
    });
  });

  // ─── findOne ────────────────────────────────────────────────────────────

  describe('findOne', () => {
    it('debe lanzar NotFoundException si no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);
      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });

    it('debe devolver la reserva si existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { id: 5, status: ReservationStatus.CONFIRMED },
      ]);
      const result = await service.findOne(5);
      expect(result.id).toBe(5);
    });
  });

  // ─── transition ───────────────────────────────────────────────────────────

  describe('transition', () => {
    it('debe confirmar una reserva PENDING → CONFIRMED y commitear', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 1, status: ReservationStatus.PENDING }]) // SELECT FOR UPDATE
        .mockResolvedValueOnce(undefined); // UPDATE reservations
      // findOne posterior
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.CONFIRMED },
      ]);

      const result = await service.transition(
        1,
        { action: ReservationAction.CONFIRM },
        42,
      );

      expect(result.status).toBe(ReservationStatus.CONFIRMED);
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('debe notificar al huésped al confirmar cuando hay schema', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 1, status: ReservationStatus.PENDING }])
        .mockResolvedValueOnce(undefined);
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, tenant_id: 77, status: ReservationStatus.CONFIRMED },
      ]);

      await service.transition(
        1,
        { action: ReservationAction.CONFIRM },
        42,
        'tenant_acme',
        'acme',
      );

      expect(mockNotification.notifyGuest).toHaveBeenCalledTimes(1);
      const call = mockNotification.notifyGuest.mock.calls[0] as unknown[];
      expect(call[1]).toBe(77); // guest userId = tenant_id
    });

    it('debe liberar las noches al cancelar (releasesAvailability)', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 1, status: ReservationStatus.CONFIRMED }]) // SELECT FOR UPDATE
        .mockResolvedValueOnce(undefined) // UPDATE reservations
        .mockResolvedValueOnce(undefined); // UPDATE property_availability (liberar)
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.CANCELLED },
      ]);

      await service.transition(1, { action: ReservationAction.CANCEL }, 42);

      // 3 queries dentro de la transacción: SELECT, UPDATE reserva, UPDATE disponibilidad
      expect(mockQueryRunner.query).toHaveBeenCalledTimes(3);
      const releaseCall = mockQueryRunner.query.mock.calls[2] as [
        string,
        unknown[],
      ];
      expect(releaseCall[0]).toContain('property_availability');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      // Cancelación del host → reembolso íntegro (100%).
      expect(mockRefund.refundApprovedPayments).toHaveBeenCalledWith(
        mockQueryRunner,
        1,
        100,
        42,
      );
    });

    it('NO debe reembolsar en un NO_SHOW (ausencia del huésped)', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 1, status: ReservationStatus.CONFIRMED }])
        .mockResolvedValueOnce(undefined)
        .mockResolvedValueOnce(undefined);
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.NO_SHOW },
      ]);

      await service.transition(1, { action: ReservationAction.NO_SHOW }, 42);

      expect(mockRefund.refundApprovedPayments).not.toHaveBeenCalled();
    });

    it('debe devolver el depósito al COMPLETAR la estadía', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 1,
            status: ReservationStatus.IN_PROGRESS,
            property_id: 3,
            unit_id: 7,
            tenant_id: 9,
            checkout_date: '2026-06-15',
            total_amount: '570.00', // 420 alquiler + 150 depósito
            security_deposit: '150.00',
            approved_paid: '570.00',
          },
        ])
        .mockResolvedValueOnce(undefined) // UPDATE reservations
        .mockResolvedValueOnce([]) // SELECT orden de limpieza existente (none)
        .mockResolvedValueOnce(undefined); // INSERT orden de limpieza
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.COMPLETED },
      ]);

      await service.transition(1, { action: ReservationAction.COMPLETE }, 42);

      // sólo se devuelve el depósito (150); el alquiler se gana
      expect(mockRefund.refundAbsoluteAmount).toHaveBeenCalledWith(
        mockQueryRunner,
        1,
        150,
        42,
        'security_deposit_return',
      );
      // y se crea una orden de trabajo de limpieza (turnover) tipo CLEANING
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const insertCall = mockQueryRunner.query.mock.calls.find(
        ([sql]) =>
          typeof sql === 'string' &&
          sql.includes('INSERT INTO maintenance_requests') &&
          sql.includes("'CLEANING'"),
      );
      expect(insertCall).toBeDefined();
    });

    it('NO debe tocar disponibilidad al confirmar (no libera)', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([{ id: 1, status: ReservationStatus.PENDING }])
        .mockResolvedValueOnce(undefined);
      mockDataSource.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.CONFIRMED },
      ]);

      await service.transition(1, { action: ReservationAction.CONFIRM }, 42);

      // Sólo 2 queries: SELECT FOR UPDATE + UPDATE reserva (sin liberar noches)
      expect(mockQueryRunner.query).toHaveBeenCalledTimes(2);
    });

    it('debe rechazar transición inválida y revertir (ConflictException)', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { id: 1, status: ReservationStatus.COMPLETED }, // ya terminal
      ]);

      await expect(
        service.transition(1, { action: ReservationAction.CONFIRM }, 42),
      ).rejects.toThrow(ConflictException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar NotFoundException y revertir si la reserva no existe', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([]); // SELECT FOR UPDATE vacío

      await expect(
        service.transition(999, { action: ReservationAction.CANCEL }, 42),
      ).rejects.toThrow(NotFoundException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
