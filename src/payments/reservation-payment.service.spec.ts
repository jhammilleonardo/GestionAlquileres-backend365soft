import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationPaymentService } from './reservation-payment.service';
import { PaymentCreationNotificationService } from './payment-creation-notification.service';
import { CreateReservationPaymentDto } from './dto';

function mockReservation(overrides?: Record<string, string | number>) {
  return {
    id: 5,
    tenant_id: 42,
    property_id: 3,
    status: 'confirmed',
    currency: 'BOB',
    total_amount: '420.00',
    ...overrides,
  };
}

const dto: CreateReservationPaymentDto = {
  amount: 200,
  payment_method: 'TRANSFER' as CreateReservationPaymentDto['payment_method'],
  payment_date: '2026-06-01',
};

describe('ReservationPaymentService', () => {
  let service: ReservationPaymentService;
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
  const mockNotification = { notifyAdminsOfPendingPayment: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationPaymentService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: PaymentCreationNotificationService,
          useValue: mockNotification,
        },
      ],
    }).compile();

    service = module.get(ReservationPaymentService);
    jest.resetAllMocks();
    mockDataSource.createQueryRunner.mockReturnValue(mockQueryRunner);
    mockDataSource.query.mockResolvedValue([]);
  });

  it('crea un pago de reserva PENDING vinculado a la reserva', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([mockReservation()]) // SELECT FOR UPDATE
      .mockResolvedValueOnce([{ paid: '0' }]) // suma comprometida
      .mockResolvedValueOnce([
        { id: 99, reservation_id: 5, status: 'PENDING' },
      ]); // INSERT

    const result = await service.createReservationPayment(
      'tenant_acme',
      5,
      42,
      dto,
    );

    expect(result.id).toBe(99);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(mockNotification.notifyAdminsOfPendingPayment).toHaveBeenCalledTimes(
      1,
    );
    // El INSERT vincula reservation_id y deja contract_id NULL (3er parámetro).
    const insertCall = mockQueryRunner.query.mock.calls[2] as [
      string,
      unknown[],
    ];
    expect(insertCall[0]).toContain('contract_id, reservation_id');
    expect(insertCall[1][1]).toBe(5);
  });

  it('rechaza si la reserva pertenece a otro inquilino', async () => {
    mockQueryRunner.query.mockResolvedValueOnce([
      mockReservation({ tenant_id: 99 }),
    ]);

    await expect(
      service.createReservationPayment('tenant_acme', 5, 42, dto),
    ).rejects.toThrow(NotFoundException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechaza si la reserva no es pagable (estado terminal)', async () => {
    mockQueryRunner.query.mockResolvedValueOnce([
      mockReservation({ status: 'cancelled' }),
    ]);

    await expect(
      service.createReservationPayment('tenant_acme', 5, 42, dto),
    ).rejects.toThrow(BadRequestException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechaza si el monto excede el saldo pendiente', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([mockReservation()]) // total 420
      .mockResolvedValueOnce([{ paid: '300' }]); // ya comprometido 300 → saldo 120

    await expect(
      service.createReservationPayment('tenant_acme', 5, 42, {
        ...dto,
        amount: 200,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('cuenta pagos pendientes, procesando y aprobados como dinero comprometido para evitar sobrecobro', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([mockReservation()]) // total 420
      .mockResolvedValueOnce([{ paid: '419.99' }]);

    await expect(
      service.createReservationPayment('tenant_acme', 5, 42, {
        ...dto,
        amount: 1,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(mockQueryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });

  it('descuenta reembolsos parciales de pagos aprobados al calcular saldo comprometido', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([mockReservation()]) // total 420
      .mockResolvedValueOnce([{ paid: '320' }]) // aprobado neto 300 + pendiente 20
      .mockResolvedValueOnce([{ id: 101, status: 'PENDING' }]);

    const result = await service.createReservationPayment(
      'tenant_acme',
      5,
      42,
      {
        ...dto,
        amount: 100,
      },
    );

    expect(result.id).toBe(101);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access
    const committedSql = mockQueryRunner.query.mock.calls[1][0];
    expect(committedSql).toContain('payment_refunds pr');
    expect(committedSql).toContain("WHEN p.status = 'APPROVED'");
    expect(committedSql).toContain(
      'GREATEST(0, p.amount - COALESCE(ref.total_refunded, 0))',
    );
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('permite pagar exactamente el saldo pendiente', async () => {
    mockQueryRunner.query
      .mockResolvedValueOnce([mockReservation()]) // total 420
      .mockResolvedValueOnce([{ paid: '220' }]) // saldo 200
      .mockResolvedValueOnce([{ id: 100, status: 'PENDING' }]);

    const result = await service.createReservationPayment(
      'tenant_acme',
      5,
      42,
      {
        ...dto,
        amount: 200,
      },
    );

    expect(result.id).toBe(100);
    expect(mockQueryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
