import { DataSource } from 'typeorm';
import { QrPaymentProcessingService } from './qr-payment-processing.service';

describe('QrPaymentProcessingService', () => {
  let service: QrPaymentProcessingService;
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
    service = new QrPaymentProcessingService(
      dataSource as unknown as DataSource,
    );
  });

  it('procesa pago QR usando tablas calificadas sin SET search_path', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 7,
          contract_id: null,
          pago_id: null,
          monto: 150,
          alias: 'QR365T7T20260516000000abcdef12',
          detalle_glosa: null,
        },
      ])
      .mockResolvedValueOnce([{ id: 10, property_id: 20 }])
      .mockResolvedValueOnce([{ id: 99 }])
      .mockResolvedValueOnce([]);

    await expect(
      service.procesarPagoQr('tenant_acme', {
        id: 5,
        tenant_id: 7,
        contract_id: null,
        monto: 150,
        alias: 'QR365T7T20260516000000abcdef12',
        detalle_glosa: null,
      }),
    ).resolves.toMatchObject({
      payment_processed: true,
      payment_id: 99,
      qr_id: 5,
    });

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [5],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".contracts'),
      [7],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('INSERT INTO "tenant_acme".payments'),
      [
        7,
        10,
        20,
        150,
        'RENT',
        'QR_MC4',
        'APPROVED',
        expect.any(String),
        'QR-QR365T7T20260516000000abcdef12',
        'Pago vía QR MC4',
        'mc4_qr',
      ],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('UPDATE "tenant_acme".qr_payments'),
      [99, 'PAGADO', 5],
    );
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('marca QR pagado sin crear payment cuando no encuentra contrato activo', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 5,
          tenant_id: 7,
          contract_id: null,
          pago_id: null,
          monto: 150,
          alias: 'QR365T7T20260516000000abcdef12',
          detalle_glosa: null,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.procesarPagoQr('tenant_acme', {
        id: 5,
        tenant_id: 7,
        contract_id: null,
        monto: 150,
        alias: 'QR365T7T20260516000000abcdef12',
        detalle_glosa: null,
      }),
    ).resolves.toMatchObject({
      payment_processed: true,
      payment_id: null,
      qr_id: 5,
    });

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('UPDATE "tenant_acme".qr_payments'),
      [null, 'PAGADO', 5],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('no duplica payments si el QR ya tiene pago_id asociado', async () => {
    queryRunner.query.mockResolvedValueOnce([
      {
        id: 5,
        tenant_id: 7,
        contract_id: 10,
        pago_id: 99,
        monto: 150,
        alias: 'QR365T7T20260516000000abcdef12',
        detalle_glosa: null,
      },
    ]);

    await expect(
      service.procesarPagoQr('tenant_acme', {
        id: 5,
        tenant_id: 7,
        contract_id: 10,
        pago_id: 99,
        monto: 150,
        alias: 'QR365T7T20260516000000abcdef12',
        detalle_glosa: null,
      }),
    ).resolves.toMatchObject({
      payment_processed: true,
      payment_id: 99,
      qr_id: 5,
    });

    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FOR UPDATE'),
      [5],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
