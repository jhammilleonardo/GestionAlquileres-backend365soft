import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { PaymentMethod } from './enums';
import { PaymentMethodsService } from './payment-methods.service';

describe('PaymentMethodsService', () => {
  let service: PaymentMethodsService;
  let dataSource: {
    query: jest.Mock<Promise<unknown>, [string, unknown[]?]>;
  };
  let tenantsService: {
    findBySlug: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn<Promise<unknown>, [string, unknown[]?]>(),
    };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({
        slug: 'acme',
        schema_name: 'tenant_acme',
      }),
    };

    service = new PaymentMethodsService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
    );
  });

  it('resuelve las etiquetas de los códigos regionales configurados (caso real)', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: ['qr_accl', 'transferencia'],
      },
    ]);

    const methods = await service.getAvailablePaymentMethods('acme');

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT payment_methods FROM "tenant_acme".tenant_config LIMIT 1',
    );
    expect(methods).toEqual([
      { method: 'qr_accl', label: 'QR MC4 (Bolivia)' },
      { method: 'transferencia', label: 'Transferencia bancaria' },
    ]);
  });

  it('etiqueta códigos legados del enum y humaniza los desconocidos sin descartarlos', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: [
          PaymentMethod.CASH,
          PaymentMethod.QR_MC4,
          'mi_metodo',
        ],
      },
    ]);

    const methods = await service.getAvailablePaymentMethods('acme');

    expect(methods).toEqual([
      { method: PaymentMethod.CASH, label: 'Efectivo' },
      { method: PaymentMethod.QR_MC4, label: 'QR MC4 (Bolivia)' },
      { method: 'mi_metodo', label: 'Mi metodo' },
    ]);
  });

  it('descarta duplicados y entradas vacías', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: ['stripe', 'stripe', '  ', 'paypal'],
      },
    ]);

    await expect(service.getAvailablePaymentMethods('acme')).resolves.toEqual([
      { method: 'stripe', label: 'Tarjeta de crédito/débito' },
      { method: 'paypal', label: 'PayPal' },
    ]);
  });

  it('soporta configuración serializada como JSON', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: JSON.stringify(['transferencia']),
      },
    ]);

    await expect(service.getAvailablePaymentMethods('acme')).resolves.toEqual([
      { method: 'transferencia', label: 'Transferencia bancaria' },
    ]);
  });

  it('devuelve todos los métodos cuando no hay configuración', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    const methods = await service.getAvailablePaymentMethods('acme');

    expect(methods.length).toBe(Object.values(PaymentMethod).length);
    expect(methods).toContainEqual({
      method: PaymentMethod.CASH,
      label: 'Efectivo',
    });
  });
});
