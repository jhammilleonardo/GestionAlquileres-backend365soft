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

  it('lee métodos configurados desde tenant_config con schema calificado', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: [PaymentMethod.CASH, PaymentMethod.QR_MC4, 'INVALID'],
      },
    ]);

    const methods = await service.getAvailablePaymentMethods('acme');

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(dataSource.query).toHaveBeenCalledWith(
      'SELECT payment_methods FROM "tenant_acme".tenant_config LIMIT 1',
    );
    expect(methods).toEqual([
      { method: PaymentMethod.CASH, label: 'Efectivo' },
      { method: PaymentMethod.QR_MC4, label: 'QR Dinámico (MC4/SIP)' },
    ]);
  });

  it('soporta configuración serializada como JSON', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        payment_methods: JSON.stringify([PaymentMethod.TRANSFER]),
      },
    ]);

    await expect(service.getAvailablePaymentMethods('acme')).resolves.toEqual([
      { method: PaymentMethod.TRANSFER, label: 'Transferencia Bancaria' },
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
