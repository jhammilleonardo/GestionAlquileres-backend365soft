import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { PaymentWebhookService } from './payment-webhook.service';

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
  let loggerLogSpy: jest.SpyInstance;
  let loggerDebugSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerLogSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
    loggerDebugSpy = jest.spyOn(Logger.prototype, 'debug').mockImplementation();

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

    service = new PaymentWebhookService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
    );
  });

  afterEach(() => {
    loggerLogSpy.mockRestore();
    loggerDebugSpy.mockRestore();
  });

  it('registra evento idempotente y actualiza pago con schema calificado', async () => {
    queryRunner.query
      .mockResolvedValueOnce([{ event_id: 'evt_1' }])
      .mockResolvedValueOnce([{ id: 33, tenant_id: 7 }]);

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

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO "tenant_acme".webhook_events'),
      ['evt_1', 'stripe', 'APPROVED', JSON.stringify({ id: 'evt_1' })],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "tenant_acme".payments'),
      ['APPROVED', 'tx_1'],
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

    expect(queryRunner.query).toHaveBeenCalledTimes(2);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
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
