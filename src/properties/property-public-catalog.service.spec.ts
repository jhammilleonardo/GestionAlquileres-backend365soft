import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyPublicCatalogService } from './property-public-catalog.service';

describe('PropertyPublicCatalogService', () => {
  let service: PropertyPublicCatalogService;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new PropertyPublicCatalogService(
      dataSource as unknown as DataSource,
    );
  });

  it('finds public catalog properties using schema-qualified SQL', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([{ id: 15, title: 'Casa Norte' }]);

    await expect(
      service.findCatalogProperties(
        { page: 1, limit: 20, sort: 'price_asc' },
        'acme',
      ),
    ).resolves.toMatchObject({
      data: [{ id: 15, title: 'Casa Norte' }],
      total: 1,
      page: 1,
      limit: 20,
      totalPages: 1,
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      ['acme'],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      ['DISPONIBLE'],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('ORDER BY p.id, p.monthly_rent ASC'),
      ['DISPONIBLE', 20, 0],
    );
  });

  it('finds public catalog detail and loads addresses and owners', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 15, title: 'Casa Norte' }])
      .mockResolvedValueOnce([{ id: 1, street_address: 'Av. 1' }])
      .mockResolvedValueOnce([{ id: 2, name: 'Owner' }]);

    const recordSpy = jest
      .spyOn(service, 'recordPropertyView')
      .mockResolvedValue(undefined);

    await expect(
      service.findCatalogPropertyDetail(15, 'acme', '127.0.0.1'),
    ).resolves.toMatchObject({
      id: 15,
      title: 'Casa Norte',
      addresses: [{ id: 1, street_address: 'Av. 1' }],
      owners: [{ id: 2, name: 'Owner' }],
    });

    expect(recordSpy).toHaveBeenCalledWith(15, '127.0.0.1', 'tenant_acme');
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      [15],
    );
  });

  it('throws NotFoundException when public detail does not exist', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.findCatalogPropertyDetail(999, 'acme'),
    ).rejects.toThrow(NotFoundException);
  });

  it('records catalog views using schema-qualified tables', async () => {
    dataSource.query
      .mockResolvedValueOnce(undefined)
      .mockResolvedValueOnce(undefined);

    await service.recordPropertyView(15, '127.0.0.1', 'tenant_acme');

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('UPDATE "tenant_acme".properties'),
      [15],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('INSERT INTO "tenant_acme".property_view_logs'),
      [15, '127.0.0.1'],
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });
});
