import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantsService } from '../tenants/tenants.service';
import { PaymentStatus, PaymentType, PaymentMethod, Currency } from './enums';
import { PaymentSortField } from './dto';
import { PaymentQueriesService } from './payment-queries.service';

describe('PaymentQueriesService', () => {
  let service: PaymentQueriesService;
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

    service = new PaymentQueriesService(
      dataSource as unknown as DataSource,
      tenantsService as unknown as TenantsService,
    );
  });

  it('getTenantPayments usa tablas calificadas por schema sin mutar search_path', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await service.getTenantPayments(7, 'acme');

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme".payments p'),
      [7],
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('getAllPayments parametriza filtros y limita el ordenamiento a campos permitidos', async () => {
    dataSource.query.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        total: 0,
      },
    ]);

    await service.getAllPayments(
      {
        status: PaymentStatus.APPROVED,
        type: PaymentType.RENT,
        method: PaymentMethod.WIRE_TRANSFER,
        currency: Currency.BOB,
        tenant_id: 7,
        sort: PaymentSortField.AMOUNT,
        order: 'ASC',
        page: 2,
        limit: 10,
      },
      'tenant_acme',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('FROM "tenant_acme".payments p'),
      [
        PaymentStatus.APPROVED,
        PaymentType.RENT,
        PaymentMethod.WIRE_TRANSFER,
        Currency.BOB,
        7,
        10,
        10,
      ],
    );
    const firstSql = dataSource.query.mock.calls[0][0];
    expect(firstSql).toContain('ORDER BY p.amount ASC');
    expect(firstSql).not.toContain('SET search_path');
  });

  it('exportPaymentsCsv escapa comillas y usa schema explícito', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        amount: 100,
        currency: 'BOB',
        payment_type: 'RENT',
        payment_method: 'CASH',
        status: 'APPROVED',
        payment_date: '2026-05-16',
        due_date: null,
        reference_number: 'REF-1',
        notes: 'Pago "mayo"',
        created_at: '2026-05-16',
        tenant_name: 'Ana',
        tenant_email: 'ana@example.com',
        property_title: 'Depto 1',
        contract_number: 'CTR-1',
      },
    ]);

    const csv = await service.exportPaymentsCsv({}, 'tenant_acme');

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme".payments p'),
      [],
    );
    expect(csv).toContain('"Pago ""mayo"""');
  });

  it('getPaymentById lanza NotFoundException cuando no existe', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.getPaymentById(99, 7, 'tenant_acme'),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
