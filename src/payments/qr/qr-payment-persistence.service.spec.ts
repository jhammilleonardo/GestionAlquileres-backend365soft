import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  QrPaymentDbRow,
  QrPaymentPersistenceService,
} from './qr-payment-persistence.service';

describe('QrPaymentPersistenceService', () => {
  let service: QrPaymentPersistenceService;
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };

  const baseQrRow: QrPaymentDbRow = {
    id: 1,
    alias: 'QR365T7T20260517000000abcdef12',
    estado: 'PENDIENTE',
    tenant_id: 7,
    contract_id: null,
    pago_id: null,
    monto: '150.25',
    currency: 'BOB',
    payment_type: 'RENT',
    detalle_glosa: 'Alquiler - Juan Perez',
    imagen_qr: JSON.stringify({ imagenQr: 'base64-image' }),
    fecha_vencimiento: '2026-05-18T00:00:00.000Z',
    created_at: '2026-05-17T00:00:00.000Z',
    updated_at: '2026-05-17T00:00:00.000Z',
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    service = new QrPaymentPersistenceService(
      dataSource as unknown as DataSource,
    );
  });

  it('asegura tabla qr_payments con schema calificado y cache por schema', async () => {
    dataSource.query.mockResolvedValue([]);

    await service.ensureQrTable('tenant_acme');
    await service.ensureQrTable('tenant_acme');

    expect(dataSource.query).toHaveBeenCalledTimes(3);
    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining(
        'CREATE TABLE IF NOT EXISTS "tenant_acme".qr_payments',
      ),
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('ALTER TABLE "tenant_acme".qr_payments'),
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('ON "tenant_acme".qr_payments(alias)'),
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('mapea registro QR parseando imagen JSON y defaults del DTO', () => {
    const mapped = service.mapQrRecord(
      {
        ...baseQrRow,
        currency: null,
        payment_type: null,
        detalle_glosa: null,
      },
      {
        currency: 'USD',
        payment_type: 'DEPOSIT',
        notes: 'nota visible',
      },
    );

    expect(mapped).toMatchObject({
      id: 1,
      tenant_id: 7,
      contract_id: null,
      amount: 150.25,
      currency: 'USD',
      payment_type: 'DEPOSIT',
      status: 'PENDIENTE',
      qr_image: 'base64-image',
      notes: 'nota visible',
    });
  });

  it('crea QR pendiente guardando respuesta MC4 y devuelve salida mapeada', async () => {
    dataSource.query.mockResolvedValueOnce([baseQrRow]);

    await expect(
      service.createPendingQr('tenant_acme', {
        alias: baseQrRow.alias,
        detalleGlosa: 'Alquiler - Juan Perez',
        imagenQr: { imagenQr: 'base64-image', idQr: 'mc4-1' },
        fechaVencimiento: new Date('2026-05-18T00:00:00.000Z'),
        dto: {
          amount: 150.25,
          tenant_id: 7,
          contract_id: undefined,
          currency: undefined,
          payment_type: undefined,
        },
      }),
    ).resolves.toMatchObject({
      id: 1,
      amount: 150.25,
      qr_image: 'base64-image',
    });

    const insertCall = dataSource.query.mock.calls[0] as [string, unknown[]];
    expect(insertCall[0]).toContain('INSERT INTO "tenant_acme".qr_payments');
    expect(insertCall[1][0]).toBe(baseQrRow.alias);
    expect(insertCall[1][1]).toBe('PENDIENTE');
    expect(insertCall[1][8]).toBe(
      JSON.stringify({ imagenQr: 'base64-image', idQr: 'mc4-1' }),
    );
  });

  it('cancela QR pendiente validando ownership y estado', async () => {
    dataSource.query
      .mockResolvedValueOnce([baseQrRow])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ ...baseQrRow, estado: 'CANCELADO' }]);

    await expect(
      service.cancelQr('tenant_acme', baseQrRow.id, 7),
    ).resolves.toMatchObject({
      id: 1,
      status: 'CANCELADO',
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('UPDATE "tenant_acme".qr_payments'),
      ['CANCELADO', 1],
    );
  });

  it('rechaza cancelación si el QR no pertenece al tenant autenticado', async () => {
    dataSource.query.mockResolvedValueOnce([baseQrRow]);

    await expect(service.cancelQr('tenant_acme', 1, 99)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('rechaza cancelación de QR pagado', async () => {
    dataSource.query.mockResolvedValueOnce([
      { ...baseQrRow, estado: 'PAGADO' },
    ]);

    await expect(service.cancelQr('tenant_acme', 1, 7)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('lanza NotFoundException al buscar QR inexistente con findByIdOrFail', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.findByIdOrFail('tenant_acme', 404),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
