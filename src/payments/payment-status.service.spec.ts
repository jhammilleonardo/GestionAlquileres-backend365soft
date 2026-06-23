import { BadRequestException } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AccountingOutboxService } from '../accounting/accounting-outbox.service';
import { NotificationsService } from '../notifications/notifications.service';
import { SplitPaymentService } from '../split-payment/split-payment.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { PaymentStatus } from './enums';
import { PaymentApprovalService } from './payment-approval.service';
import { PaymentStatusNotificationService } from './payment-status-notification.service';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';
import {
  isValidPaymentStatusTransition,
  PaymentStatusService,
} from './payment-status.service';

describe('PaymentStatusService', () => {
  let service: PaymentStatusService;
  let queryRunner: {
    connect: jest.Mock<Promise<void>, []>;
    startTransaction: jest.Mock<Promise<void>, []>;
    commitTransaction: jest.Mock<Promise<void>, []>;
    rollbackTransaction: jest.Mock<Promise<void>, []>;
    release: jest.Mock<Promise<void>, []>;
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
    createQueryRunner: jest.Mock<QueryRunner, []>;
  };
  let notificationsService: {
    createForUserInSchema: jest.Mock<Promise<unknown>, unknown[]>;
    createForUser: jest.Mock<Promise<unknown>, unknown[]>;
  };
  let splitPaymentService: {
    executeSplit: jest.Mock<Promise<void>, unknown[]>;
  };
  let auditLogsService: {
    log: jest.Mock<Promise<void>, unknown[]>;
  };
  let accountingOutboxService: {
    enqueue: jest.Mock<Promise<void>, unknown[]>;
  };
  let paymentStatusNotificationService: PaymentStatusNotificationService;
  let paymentApprovalService: PaymentApprovalService;
  let reservationConfirmationService: {
    confirmIfFullyPaid: jest.Mock<Promise<boolean>, unknown[]>;
  };

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      startTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      commitTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      rollbackTransaction: jest
        .fn<Promise<void>, []>()
        .mockResolvedValue(undefined),
      release: jest.fn<Promise<void>, []>().mockResolvedValue(undefined),
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
      createQueryRunner: jest
        .fn<QueryRunner, []>()
        .mockReturnValue(queryRunner as unknown as QueryRunner),
    };
    notificationsService = {
      createForUserInSchema: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue({}),
      createForUser: jest
        .fn<Promise<unknown>, unknown[]>()
        .mockResolvedValue({}),
    };
    splitPaymentService = {
      executeSplit: jest
        .fn<Promise<void>, unknown[]>()
        .mockResolvedValue(undefined),
    };
    auditLogsService = {
      log: jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined),
    };
    accountingOutboxService = {
      enqueue: jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined),
    };
    reservationConfirmationService = {
      confirmIfFullyPaid: jest
        .fn<Promise<boolean>, unknown[]>()
        .mockResolvedValue(false),
    };
    paymentStatusNotificationService = new PaymentStatusNotificationService(
      notificationsService as unknown as NotificationsService,
    );
    paymentApprovalService = new PaymentApprovalService(
      dataSource as unknown as DataSource,
      splitPaymentService as unknown as SplitPaymentService,
      auditLogsService as unknown as AuditLogsService,
      paymentStatusNotificationService,
      accountingOutboxService as unknown as AccountingOutboxService,
      reservationConfirmationService as unknown as ReservationPaymentConfirmationService,
    );

    service = new PaymentStatusService(
      dataSource as unknown as DataSource,
      paymentApprovalService,
      paymentStatusNotificationService,
    );
  });

  it('valida transiciones permitidas y bloquea estados desconocidos', () => {
    expect(
      isValidPaymentStatusTransition(
        PaymentStatus.PENDING,
        PaymentStatus.APPROVED,
      ),
    ).toBe(true);
    expect(
      isValidPaymentStatusTransition(
        PaymentStatus.REJECTED,
        PaymentStatus.APPROVED,
      ),
    ).toBe(false);
    expect(
      isValidPaymentStatusTransition('UNKNOWN', PaymentStatus.APPROVED),
    ).toBe(false);
  });

  it('approvePayment actualiza y ejecuta split en la misma transacción', async () => {
    const payment = {
      id: 33,
      tenant_id: 7,
      property_id: 20,
      amount: '100.00',
      currency: 'BOB',
      payment_date: '2026-05-16',
      status: PaymentStatus.PENDING,
    };
    const updated = { ...payment, status: PaymentStatus.APPROVED };
    queryRunner.query
      .mockResolvedValueOnce([payment])
      .mockResolvedValueOnce([updated]);

    await expect(
      service.approvePayment(33, { admin_notes: 'ok' }, 99, 'tenant_acme'),
    ).resolves.toBe(updated);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM "tenant_acme".payments'),
      [33],
    );
    expect(queryRunner.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(splitPaymentService.executeSplit).toHaveBeenCalledWith(
      expect.objectContaining({
        paymentId: 33,
        propertyId: 20,
        schemaName: 'tenant_acme',
      }),
      queryRunner,
    );
    expect(accountingOutboxService.enqueue).toHaveBeenCalledWith(
      {
        schemaName: 'tenant_acme',
        eventType: 'payment.approved',
        aggregateType: 'payment',
        aggregateId: '33',
        payload: {
          paymentId: 33,
          approvedBy: 99,
        },
      },
      { queryRunner },
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(notificationsService.createForUserInSchema).toHaveBeenCalledWith(
      'tenant_acme',
      7,
      expect.any(String),
      'Pago aprobado',
      expect.any(String),
      expect.objectContaining({ payment_id: 33 }),
    );
  });

  it('approvePayment hace rollback si falla el split antes de notificar', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          property_id: 20,
          amount: '100.00',
          currency: 'BOB',
          payment_date: '2026-05-16',
          status: PaymentStatus.PENDING,
        },
      ])
      .mockResolvedValueOnce([{ id: 33, status: PaymentStatus.APPROVED }]);
    splitPaymentService.executeSplit.mockRejectedValueOnce(
      new Error('split failed'),
    );

    await expect(
      service.approvePayment(33, {}, 99, 'tenant_acme'),
    ).rejects.toThrow('split failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(notificationsService.createForUserInSchema).not.toHaveBeenCalled();
  });

  it('updatePaymentStatus rechaza transiciones inválidas', async () => {
    queryRunner.query.mockResolvedValueOnce([
      {
        id: 33,
        tenant_id: 7,
        status: PaymentStatus.REJECTED,
        amount: '100.00',
        currency: 'BOB',
      },
    ]);

    await expect(
      service.updatePaymentStatus(
        33,
        { status: PaymentStatus.APPROVED },
        99,
        'tenant_acme',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme".payments'),
      [33],
    );
  });
});
