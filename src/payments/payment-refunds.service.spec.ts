import { BadRequestException, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingOutboxService } from '../accounting/accounting-outbox.service';
import { PaymentStatus } from './enums';
import { PaymentRefundsService } from './payment-refunds.service';

describe('PaymentRefundsService', () => {
  let service: PaymentRefundsService;
  let queryRunner: {
    connect: jest.Mock<Promise<void>, []>;
    startTransaction: jest.Mock<Promise<void>, []>;
    commitTransaction: jest.Mock<Promise<void>, []>;
    rollbackTransaction: jest.Mock<Promise<void>, []>;
    release: jest.Mock<Promise<void>, []>;
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let dataSource: {
    createQueryRunner: jest.Mock;
  };
  let accountingOutboxService: {
    enqueue: jest.Mock<Promise<void>, unknown[]>;
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
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    accountingOutboxService = {
      enqueue: jest.fn<Promise<void>, unknown[]>().mockResolvedValue(undefined),
    };

    service = new PaymentRefundsService(
      dataSource as unknown as DataSource,
      accountingOutboxService as unknown as AccountingOutboxService,
    );
  });

  it('bloquea el pago y usa tablas calificadas por schema', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        { id: 33, amount: '100.00', status: PaymentStatus.APPROVED },
      ])
      .mockResolvedValueOnce([{ total: '25.00' }])
      .mockResolvedValueOnce([{ id: 77 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.createRefund(
        33,
        {
          amount: 75,
          reason: 'Devolución final',
          refund_method: 'TRANSFER',
          refund_date: '2026-05-16',
        },
        99,
        'tenant_acme',
      ),
    ).resolves.toBeUndefined();

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM "tenant_acme".payments'),
      [33],
    );
    expect(queryRunner.query.mock.calls[0][0]).toContain('FOR UPDATE');
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".payment_refunds'),
      [33],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO "tenant_acme".payment_refunds'),
      expect.any(Array),
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE "tenant_acme".payments'),
      [PaymentStatus.REFUNDED, 33],
    );
    expect(accountingOutboxService.enqueue).toHaveBeenCalledWith(
      {
        schemaName: 'tenant_acme',
        eventType: 'payment.refund.created',
        aggregateType: 'payment_refund',
        aggregateId: '77',
        payload: {
          refundId: 77,
          paymentId: 33,
          processedBy: 99,
        },
      },
      { queryRunner },
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('no marca REFUNDED cuando el reembolso es parcial', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        { id: 33, amount: '100.00', status: PaymentStatus.APPROVED },
      ])
      .mockResolvedValueOnce([{ total: '25.00' }])
      .mockResolvedValueOnce([{ id: 78 }]);

    await service.createRefund(
      33,
      {
        amount: 10,
        reason: 'Devolución parcial',
      },
      99,
      'tenant_acme',
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.query.mock.calls[2][0]).toContain(
      'INSERT INTO "tenant_acme".payment_refunds',
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(accountingOutboxService.enqueue).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_acme',
        aggregateId: '78',
      }),
      { queryRunner },
    );
  });

  it('rechaza pagos inexistentes y hace rollback', async () => {
    queryRunner.query.mockResolvedValueOnce([]);

    await expect(
      service.createRefund(99, { amount: 1, reason: 'No existe' }, 7),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('rechaza sobre-reembolsos acumulados', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        { id: 33, amount: '100.00', status: PaymentStatus.APPROVED },
      ])
      .mockResolvedValueOnce([{ total: '90.00' }]);

    await expect(
      service.createRefund(33, { amount: 20, reason: 'Exceso' }, 7),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledTimes(2);
  });
});
