import { Test, TestingModule } from '@nestjs/testing';
import {
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import { ReservationNotificationService } from './reservation-notification.service';
import { ReservationRefundService } from './reservation-refund.service';
import { AvailabilityStatus } from './enums/availability-status.enum';

// El search_path se valida en el run real; aquí el queryRunner está mockeado.
jest.mock('../common/tenant/tenant-search-path', () => ({
  applyTenantSearchPath: jest.fn().mockResolvedValue(undefined),
}));

function mockUnit(
  overrides?: Partial<Record<string, string>>,
): Record<string, string> {
  return {
    id: '7',
    property_id: '3',
    rental_type: 'SHORT_TERM',
    price_per_night: '80.00',
    cleaning_fee: '20.00',
    currency: 'BOB',
    min_nights: '2',
    max_nights: '30',
    tenant_rental_type: 'BOTH',
    ...overrides,
  };
}

describe('ReservationsService', () => {
  let service: ReservationsService;
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
        ReservationsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: ReservationNotificationService,
          useValue: mockNotification,
        },
        { provide: ReservationRefundService, useValue: mockRefund },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    jest.resetAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    // Por defecto las consultas devuelven [] (incluye findSeasons sin temporadas);
    // cada test sobreescribe las que necesita con mockResolvedValueOnce.
    mockDataSource.query.mockResolvedValue([]);
  });

  // ─── getMonthAvailability ─────────────────────────────────────────────────

  describe('getMonthAvailability', () => {
    it('debe retornar todos los días del mes con estado available por defecto', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getMonthAvailability(3, '2026-05');

      expect(result).toHaveLength(31);
      expect(result[0]).toEqual({
        date: '2026-05-01',
        status: AvailabilityStatus.AVAILABLE,
      });
      expect(result[30]).toEqual({
        date: '2026-05-31',
        status: AvailabilityStatus.AVAILABLE,
      });
    });

    it('debe sobrescribir el estado de días con registros en BD', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { date: '2026-05-10', status: 'blocked' },
        { date: '2026-05-11', status: 'booked' },
      ]);

      const result = await service.getMonthAvailability(3, '2026-05');

      const may10 = result.find((d) => d.date === '2026-05-10');
      const may11 = result.find((d) => d.date === '2026-05-11');
      const may12 = result.find((d) => d.date === '2026-05-12');

      expect(may10?.status).toBe(AvailabilityStatus.BLOCKED);
      expect(may11?.status).toBe(AvailabilityStatus.BOOKED);
      expect(may12?.status).toBe(AvailabilityStatus.AVAILABLE);
    });

    it('debe marcar como booked las noches ocupadas por reservas existentes', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([]) // property_availability
        .mockResolvedValueOnce([
          { date: '2026-05-12' },
          { date: '2026-05-13' },
        ]); // reservations ocupantes

      const result = await service.getMonthAvailability(3, '2026-05', 7);

      expect(result.find((d) => d.date === '2026-05-12')?.status).toBe(
        AvailabilityStatus.BOOKED,
      );
      expect(result.find((d) => d.date === '2026-05-13')?.status).toBe(
        AvailabilityStatus.BOOKED,
      );
      expect(result.find((d) => d.date === '2026-05-14')?.status).toBe(
        AvailabilityStatus.AVAILABLE,
      );
    });

    it('debe lanzar BadRequestException si el formato del mes es incorrecto', async () => {
      await expect(service.getMonthAvailability(3, '05-2026')).rejects.toThrow(
        BadRequestException,
      );
      await expect(service.getMonthAvailability(3, '2026-13')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe generar 28 días para febrero en año no bisiesto', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getMonthAvailability(3, '2026-02');

      expect(result).toHaveLength(28);
    });
  });

  // ─── blockDates ───────────────────────────────────────────────────────────

  describe('blockDates', () => {
    it('debe bloquear las fechas indicadas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()]) // findUnitOrFail
        .mockResolvedValueOnce([]) // findBookedDates (ninguna booked)
        .mockResolvedValueOnce(null) // INSERT fecha 1
        .mockResolvedValueOnce(null); // INSERT fecha 2

      const result = await service.blockDates(
        3,
        7,
        { dates: ['2026-05-20', '2026-05-21'] },
        1,
      );

      expect(result.blocked).toBe(2);
    });

    it('debe lanzar BadRequestException si la unidad no es SHORT_TERM', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        mockUnit({ rental_type: 'LONG_TERM' }),
      ]);

      await expect(
        service.blockDates(3, 7, { dates: ['2026-05-20'] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ConflictException si alguna fecha ya está reservada', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ date: '2026-05-20' }]); // fecha booked

      await expect(
        service.blockDates(3, 7, { dates: ['2026-05-20', '2026-05-21'] }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar NotFoundException si la unidad no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.blockDates(3, 999, { dates: ['2026-05-20'] }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createReservation ────────────────────────────────────────────────────

  describe('createReservation', () => {
    const dto = {
      property_id: 3,
      unit_id: 7,
      checkin_date: '2099-06-10',
      checkout_date: '2099-06-15',
    };

    it('debe crear una reserva y retornarla', async () => {
      const mockReservation = {
        id: 1,
        nights: 5,
        total_amount: '420.00',
        status: 'confirmed',
      };

      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()]) // findUnitOrFail
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]) // validateTenantConfig
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // assertNoActiveContractOverlap (sin contrato)
        .mockResolvedValueOnce([]) // assertNoReservationOverlap (sin reserva)
        .mockResolvedValueOnce([]); // assertDatesAvailable (pre-chequeo)

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }]) // active holds
        .mockResolvedValueOnce([mockReservation]) // INSERT reservations
        .mockResolvedValueOnce(
          // claimNightsOrFail: 5 noches reclamadas (06-10..06-14)
          [
            '2099-06-10',
            '2099-06-11',
            '2099-06-12',
            '2099-06-13',
            '2099-06-14',
          ].map((date) => ({ date })),
        );

      const result = await service.createReservation(dto, 42);

      expect(result.id).toBe(1);
      expect(result.nights).toBe(5);
      const insertCall = mockQueryRunner.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      expect(insertCall[1][11]).toBe('pending_payment');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('debe guardar el total con descuento e impuesto (= al quote mostrado)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          mockUnit({
            min_nights: '1',
            weekly_discount_pct: '10.00',
            occupancy_tax_pct: '10.00',
          }),
        ]) // findUnitOrFail
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]) // validateTenantConfig
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // sin contrato
        .mockResolvedValueOnce([]) // sin reserva solapada
        .mockResolvedValueOnce([]); // pre-chequeo

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ id: 3 }]) // INSERT
        .mockResolvedValueOnce(
          // 7 noches reclamadas
          [
            '2099-06-10',
            '2099-06-11',
            '2099-06-12',
            '2099-06-13',
            '2099-06-14',
            '2099-06-15',
            '2099-06-16',
          ].map((date) => ({ date })),
        );

      await service.createReservation(
        { ...dto, checkout_date: '2099-06-17' }, // 7 noches
        42,
      );

      const insertCall = mockQueryRunner.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      // total_amount es el param $10 (índice 9). base 80*7=560; -10%=-56; neto 504;
      // impuesto 10%=50.4; limpieza 20 → total = 560-56+20+50.4 = 574.4 (sin depósito)
      expect(insertCall[1][9]).toBe(574.4);
    });

    it('debe sumar el depósito al total cobrado y guardarlo aparte', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([
          mockUnit({ min_nights: '1', deposit_amount: '150.00' }),
        ]) // findUnitOrFail
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ id: 4 }]) // INSERT
        .mockResolvedValueOnce(
          [
            '2099-06-10',
            '2099-06-11',
            '2099-06-12',
            '2099-06-13',
            '2099-06-14',
          ].map((date) => ({ date })),
        );

      await service.createReservation(dto, 42); // 5 noches

      const insertCall = mockQueryRunner.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      // security_deposit = índice 8; total_amount = índice 9.
      // alojamiento 80*5+20 = 420; depósito 150 → total cobrado 570
      expect(insertCall[1][8]).toBe(150);
      expect(insertCall[1][9]).toBe(570);
    });

    it('debe dejar la reserva en PENDING cuando la unidad es request-to-book', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ booking_mode: 'request' })]) // findUnitOrFail
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]) // validateTenantConfig
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // sin contrato
        .mockResolvedValueOnce([]) // sin reserva solapada
        .mockResolvedValueOnce([]); // pre-chequeo disponibilidad

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ id: 2, status: 'pending' }]) // INSERT
        .mockResolvedValueOnce(
          [
            '2099-06-10',
            '2099-06-11',
            '2099-06-12',
            '2099-06-13',
            '2099-06-14',
          ].map((date) => ({ date })),
        );

      await service.createReservation(dto, 42, 'tenant_acme', 'acme');

      const insertCall = mockQueryRunner.query.mock.calls[1] as [
        string,
        unknown[],
      ];
      // El estado (param $12, índice 11) debe ser 'pending' en modo request.
      expect(insertCall[1][11]).toBe('pending');
      // Y debe avisar a los admins de la solicitud.
      expect(mockNotification.notifyAdminsOfRequest).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar ConflictException si la unidad tiene un contrato de largo plazo que solapa', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '1' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([]) // findSeasons (sin temporadas)
        .mockResolvedValueOnce([{ id: 99 }]); // contrato ocupante solapado

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        ConflictException,
      );
      // No debe iniciar transacción si la coherencia falla antes
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si ya existe una reserva ocupante solapada', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '1' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // sin contrato
        .mockResolvedValueOnce([{ id: 77 }]); // reserva ocupante solapada

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        ConflictException,
      );
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('debe revertir la transacción si no se reclaman todas las noches (carrera de doble-booking)', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // sin contrato
        .mockResolvedValueOnce([]) // sin reserva solapada
        .mockResolvedValueOnce([]); // pre-chequeo pasa, pero la carrera ocurre después

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }])
        .mockResolvedValueOnce([{ id: 1, nights: 5 }]) // INSERT reservations
        .mockResolvedValueOnce([{ date: '2099-06-10' }]); // sólo 1 de 5 noches reclamadas

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        ConflictException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('debe traducir el error SQL de exclusion constraint a ConflictException', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([]);

      mockQueryRunner.query
        .mockResolvedValueOnce([{ count: 0 }])
        .mockRejectedValueOnce({
          code: '23P01',
          constraint: 'excl_reservations_no_overlap_v3',
        });

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        ConflictException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
    });

    it('debe lanzar BadRequestException si checkout <= checkin', async () => {
      await expect(
        service.createReservation(
          { ...dto, checkout_date: dto.checkin_date },
          42,
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si la unidad no es SHORT_TERM', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        mockUnit({ rental_type: 'LONG_TERM' }),
      ]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si el tenant solo admite LONG_TERM', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ rental_type: 'LONG_TERM' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar BadRequestException si no se cumplen las noches mínimas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '7' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('debe lanzar ConflictException si hay fechas no disponibles', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '1' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([]) // findSeasons
        .mockResolvedValueOnce([]) // assertNoActiveContractOverlap (sin contrato)
        .mockResolvedValueOnce([]) // assertNoReservationOverlap (sin reserva)
        .mockResolvedValueOnce([{ date: '2099-06-10', status: 'blocked' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  // ─── findMyReservations ───────────────────────────────────────────────────

  describe('findMyReservations', () => {
    it('debe retornar las reservas del inquilino filtradas por tenant_id', async () => {
      const rows = [{ id: 1, property_name: 'Casa', unit_number: 'A1' }];
      mockDataSource.query.mockResolvedValueOnce(rows);

      const result = await service.findMyReservations(42);

      expect(result).toEqual(rows);
      const [, params] = mockDataSource.query.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(params).toEqual([42]);
    });
  });

  // ─── extendReservation ────────────────────────────────────────────────────

  describe('extendReservation', () => {
    const reservation = {
      id: 11,
      property_id: 3,
      unit_id: 7,
      tenant_id: 42,
      checkin_date: '2099-06-10',
      checkout_date: '2099-06-15',
      nights: 5,
      total_amount: '420.00',
      status: 'confirmed',
      pricing_snapshot: { total: 420 },
    };

    it('previsualiza el importe adicional sin modificar la reserva', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([reservation])
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([]) // sin contrato
        .mockResolvedValueOnce([]) // sin otra reserva
        .mockResolvedValueOnce([]) // noches disponibles
        .mockResolvedValueOnce([]); // sin temporadas

      const result = await service.quoteExtension(11, 42, '2099-06-17');

      expect(result.additional_nights).toBe(2);
      expect(result.amount_difference).toBe(160);
      expect(result.new_total).toBe(580);
      expect(mockQueryRunner.startTransaction).not.toHaveBeenCalled();
    });

    it('cobra solo las noches adicionales y conserva el historial de precio', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([reservation]) // reserva bloqueada
        .mockResolvedValueOnce([mockUnit()]) // unidad
        .mockResolvedValueOnce([]) // sin contrato de largo plazo
        .mockResolvedValueOnce([]) // sin temporadas
        .mockResolvedValueOnce([{ date: '2099-06-15' }, { date: '2099-06-16' }]) // reclama únicamente las noches añadidas
        .mockResolvedValueOnce([
          {
            ...reservation,
            checkout_date: '2099-06-17',
            nights: 7,
            total_amount: '580.00',
          },
        ]); // actualización

      const result = await service.extendReservation(11, 42, '2099-06-17');

      expect(result.amount_difference).toBe(160);
      expect(result.checkout_date).toBe('2099-06-17');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);

      const claimCall = mockQueryRunner.query.mock.calls[4] as [
        string,
        unknown[],
      ];
      expect(claimCall[1][2]).toEqual(['2099-06-15', '2099-06-16']);

      const updateCall = mockQueryRunner.query.mock.calls[5] as [
        string,
        unknown[],
      ];
      const snapshot = JSON.parse(updateCall[1][4] as string) as {
        total: number;
        extensions: Array<{ amount: number }>;
      };
      expect(snapshot.total).toBe(420);
      expect(snapshot.extensions[0].amount).toBe(160);
    });

    it('rechaza la extensión si se solapa con un contrato activo', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([reservation])
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ id: 99 }]);

      await expect(
        service.extendReservation(11, 42, '2099-06-17'),
      ).rejects.toThrow(ConflictException);

      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });
  });

  // ─── getCancellationPreview ───────────────────────────────────────────────

  describe('getCancellationPreview', () => {
    it('calcula el reembolso sobre lo aprobado según la política', async () => {
      // política flexible + check-in lejano → 100%; aprobado 300 → reembolso 300
      mockDataSource.query.mockResolvedValueOnce([
        {
          checkin_date: '2099-06-10',
          currency: 'BOB',
          total_amount: '300.00',
          security_deposit: '0.00',
          cancellation_policy: 'flexible',
          approved_paid: '300.00',
        },
      ]);

      const result = await service.getCancellationPreview(5, 42);

      expect(result.refund_percentage).toBe(100);
      expect(result.refund_amount).toBe(300);
      expect(result.currency).toBe('BOB');
    });

    it('reembolsa el depósito íntegro aunque la política sea estricta', async () => {
      // strict + check-in cercano → 0% del alquiler; pero el depósito vuelve 100%
      mockDataSource.query.mockResolvedValueOnce([
        {
          checkin_date: '2099-06-10',
          currency: 'BOB',
          total_amount: '570.00', // 420 alquiler + 150 depósito
          security_deposit: '150.00',
          cancellation_policy: 'strict',
          approved_paid: '570.00',
        },
      ]);

      // strict con check-in lejano da 50%... usamos antelación corta vía fecha
      const result = await service.getCancellationPreview(5, 42);

      // strict ≥7d = 50% del alquiler (210) + depósito 150 = 360
      expect(result.refund_amount).toBe(360);
    });

    it('lanza NotFoundException si la reserva no es del inquilino', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(service.getCancellationPreview(5, 42)).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ─── cancelMyReservation ──────────────────────────────────────────────────

  describe('cancelMyReservation', () => {
    it('debe cancelar la reserva, liberar las noches y reembolsar por política', async () => {
      mockQueryRunner.query
        .mockResolvedValueOnce([
          {
            id: 5,
            tenant_id: 42,
            status: 'confirmed',
            checkin_date: '2099-06-10',
            total_amount: '570.00', // 420 alquiler + 150 depósito
            security_deposit: '150.00',
            cancellation_policy: 'flexible',
            approved_paid: '570.00',
          },
        ]) // SELECT FOR UPDATE (join units)
        .mockResolvedValueOnce(undefined) // UPDATE reservations
        .mockResolvedValueOnce(undefined); // UPDATE property_availability
      mockDataSource.query.mockResolvedValueOnce([
        { id: 5, status: 'cancelled' },
      ]); // findOneForTenant

      const result = await service.cancelMyReservation(5, 42);

      expect(result.status).toBe('cancelled');
      expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.release).toHaveBeenCalledTimes(1);
      // flexible + check-in lejano → 100% alquiler (420) + depósito (150) = 570
      expect(mockRefund.refundAbsoluteAmount).toHaveBeenCalledWith(
        mockQueryRunner,
        5,
        570,
        42,
      );
    });

    it('debe lanzar NotFoundException si la reserva es de otro inquilino', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { id: 5, tenant_id: 99, status: 'confirmed' },
      ]);

      await expect(service.cancelMyReservation(5, 42)).rejects.toThrow(
        NotFoundException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
      expect(mockQueryRunner.commitTransaction).not.toHaveBeenCalled();
    });

    it('debe lanzar ConflictException si la reserva ya no es cancelable', async () => {
      mockQueryRunner.query.mockResolvedValueOnce([
        { id: 5, tenant_id: 42, status: 'completed' },
      ]);

      await expect(service.cancelMyReservation(5, 42)).rejects.toThrow(
        ConflictException,
      );
      expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    });
  });
});
