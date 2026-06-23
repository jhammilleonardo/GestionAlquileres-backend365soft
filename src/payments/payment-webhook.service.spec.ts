import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';

describe('PaymentWebhookService', () => {
  let service: PaymentWebhookService;
  let dataSource: {
    createQueryRunner: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock<Promise<void>, []>;
    startTransaction: jest.Mock<Promise<void>, []>;
    commitTransaction: jest.Mock<Promise<void>, []>;
    rollbackTransaction: jest.Mock<Promise<void>, []>;
    release: jest.Mock<Promise<void>, []>;
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let tenantsService: {
    findBySlug: jest.Mock;
  };
  let reservationConfirmationService: {
    confirmIfFullyPaid: jest.Mock;
  };
  let loggerLogSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;
  let loggerWarnSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();
    loggerWarnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation();

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
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({
        slug: 'acme',
        schema_name: 'tenant_acme',
      }),
    };
    reservationConfirmationService = {
      confirmIfFullyPaid: jest.fn().mockResolvedValue(false),
    };

    service = new PaymentWebhookService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
      reservationConfirmationService as unknown as ReservationPaymentConfirmationService,
    );
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerDebugSpy.mockRestore();
    loggerWarnSpy.mockRestore();
  });

  it('registra evento idempotente y actualiza pago con schema calificado', async () => {
    queryRunner.query
      .mockResolvedValueOnce([{ event_id: 'evt_1' }])
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          amount: '100.00',
          currency: 'USD',
          status: 'PROCESSING',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          amount: '100.00',
          currency: 'USD',
          status: 'APPROVED',
        },
      ]);

    await service.handleWebhookResult(
      'acme',
      {
        event_id: 'evt_1',
        transaction_id: 'tx_1',
        amount: 100,
        currency: 'USD',
        status: 'APPROVED',
        raw_event: { id: 'evt_1' },
      },
      'stripe',
    );

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO "tenant_acme".webhook_events'),
      ['stripe:evt_1', 'stripe', 'APPROVED', JSON.stringify({ id: 'evt_1' })],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FOR UPDATE'),
      ['stripe', 'tx_1', 'tx_1'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE "tenant_acme".payments'),
      ['APPROVED', 'tx_1', 33, 'PROCESSING', true],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('ignora webhooks duplicados sin actualizar pagos', async () => {
    queryRunner.query.mockResolvedValueOnce([]);

    await service.handleWebhookResult(
      'acme',
      {
        event_id: 'evt_1',
        transaction_id: 'tx_1',
        status: 'APPROVED',
        raw_event: { id: 'evt_1' },
      },
      'stripe',
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('revierte el evento si falla la actualización del pago', async () => {
    const updateError = new Error('database timeout');
    queryRunner.query
      .mockResolvedValueOnce([{ event_id: 'evt_1' }])
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          amount: '100.00',
          currency: 'USD',
          status: 'PROCESSING',
        },
      ])
      .mockRejectedValueOnce(updateError);

    await expect(
      service.handleWebhookResult(
        'acme',
        {
          event_id: 'evt_1',
          transaction_id: 'tx_1',
          status: 'APPROVED',
          raw_event: { id: 'evt_1' },
        },
        'stripe',
      ),
    ).rejects.toThrow(updateError);

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('no degrada un pago aprobado por un webhook tardío', async () => {
    queryRunner.query
      .mockResolvedValueOnce([{ event_id: 'evt_late' }])
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          amount: '100.00',
          currency: 'USD',
          status: 'APPROVED',
        },
      ]);

    await service.handleWebhookResult(
      'acme',
      {
        event_id: 'evt_late',
        transaction_id: 'tx_1',
        status: 'FAILED',
        raw_event: { id: 'evt_late' },
      },
      'stripe',
    );

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(loggerWarnSpy).toHaveBeenCalledWith(
      expect.stringContaining('APPROVED -> FAILED no permitida'),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('rechaza monto o moneda que no corresponden al pago', async () => {
    queryRunner.query
      .mockResolvedValueOnce([{ event_id: 'evt_amount' }])
      .mockResolvedValueOnce([
        {
          id: 33,
          tenant_id: 7,
          amount: '100.00',
          currency: 'USD',
          status: 'PROCESSING',
        },
      ]);

    await expect(
      service.handleWebhookResult(
        'acme',
        {
          event_id: 'evt_amount',
          transaction_id: 'tx_1',
          amount: 10,
          currency: 'USD',
          status: 'APPROVED',
          raw_event: { id: 'evt_amount' },
        },
        'stripe',
      ),
    ).rejects.toThrow('El monto del webhook no coincide');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('no consulta DB cuando el webhook no trae transaction_id', async () => {
    await service.handleWebhookResult(
      'acme',
      {
        event_id: 'evt_1',
        status: 'FAILED',
        raw_event: { id: 'evt_1' },
      },
      'stripe',
    );

    expect(tenantsService.findBySlug).not.toHaveBeenCalled();
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});
