import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyPublicCatalogQueryService } from './property-public-catalog-query.service';
import { PropertyPublicCatalogService } from './property-public-catalog.service';

describe('PropertyPublicCatalogService', () => {
  let service: PropertyPublicCatalogService;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new PropertyPublicCatalogService(
      dataSource as unknown as DataSource,
      new PropertyPublicCatalogQueryService(),
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
        true,
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
      expect.stringContaining('ORDER BY p.monthly_rent ASC NULLS LAST'),
      ['DISPONIBLE', 20, 0],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('unit_metrics.available_units'),
      ['DISPONIBLE', 20, 0],
    );
  });

  it('uses available unit nightly price for short-term catalog filters', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ count: '1' }])
      .mockResolvedValueOnce([
        {
          id: 16,
          title: 'Suite Centro',
          min_price_per_night: '85.00',
          available_short_term_units: 1,
        },
      ]);

    await expect(
      service.findCatalogProperties(
        {
          page: 1,
          limit: 20,
          sort: 'price_asc',
          rental_type: 'SHORT_TERM',
          min_price: 50,
          max_price: 120,
        },
        'acme',
        true,
      ),
    ).resolves.toMatchObject({
      data: [
        {
          id: 16,
          title: 'Suite Centro',
          min_price_per_night: '85.00',
        },
      ],
      total: 1,
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("p.rental_type IN ('SHORT_TERM', 'BOTH')"),
      ['DISPONIBLE', 50, 120],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('COALESCE(unit_metrics.total_units, 0) = 0 OR'),
      ['DISPONIBLE', 50, 120],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'COALESCE(unit_metrics.min_price_per_night, p.monthly_rent) >= $2',
      ),
      ['DISPONIBLE', 50, 120],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'ORDER BY COALESCE(unit_metrics.min_price_per_night, p.monthly_rent) ASC NULLS LAST',
      ),
      ['DISPONIBLE', 50, 120, 20, 0],
    );
  });

  it('matches country by display name or ISO code using schema-qualified address SQL', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.findCatalogProperties(
      { page: 1, limit: 20, country: 'Bolivia' },
      'acme',
      true,
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining(
        'FROM "tenant_acme".property_addresses pa_search',
      ),
      ['DISPONIBLE', ['bolivia', 'bo']],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('LOWER(pa_search.country) = ANY($2::text[])'),
      ['DISPONIBLE', ['bolivia', 'bo']],
    );
  });

  it('orders available catalog properties by available unit count, not views', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.findCatalogProperties(
      { page: 1, limit: 20, sort: 'available' },
      'acme',
      true,
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining(
        'ORDER BY unit_metrics.available_units DESC, p.created_at DESC, p.id ASC',
      ),
      ['DISPONIBLE', 20, 0],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.not.stringContaining('ORDER BY p.last_viewed_at'),
      ['DISPONIBLE', 20, 0],
    );
  });

  it('finds public catalog detail without owner contact information', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 15, title: 'Casa Norte' }])
      .mockResolvedValueOnce([
        { city: 'La Paz', state: 'La Paz', country: 'Bolivia' },
      ])
      .mockResolvedValueOnce([{ id: 3, unit_number: '101' }]);

    const recordSpy = jest
      .spyOn(service, 'recordPropertyView')
      .mockResolvedValue(undefined);

    await expect(
      service.findCatalogPropertyDetail(15, 'acme', '127.0.0.1', true),
    ).resolves.toMatchObject({
      id: 15,
      title: 'Casa Norte',
      addresses: [{ city: 'La Paz', state: 'La Paz', country: 'Bolivia' }],
      units: [{ id: 3, unit_number: '101' }],
    });

    expect(recordSpy).toHaveBeenCalledWith(15, '127.0.0.1', 'tenant_acme');
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      [15],
    );
    expect(dataSource.query).toHaveBeenCalledTimes(4);
  });

  it('uses an explicit public projection and only returns available properties', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ is_published: true }])
      .mockResolvedValueOnce([
        { id: 15, title: 'Casa Norte', status: 'DISPONIBLE' },
      ])
      .mockResolvedValueOnce([
        { city: 'La Paz', state: 'La Paz', country: 'Bolivia' },
      ])
      .mockResolvedValueOnce([
        { id: 3, unit_number: '101', status: 'available' },
      ]);
    jest.spyOn(service, 'recordPropertyView').mockResolvedValue(undefined);

    const detail = await service.findCatalogPropertyDetail(15, 'acme');
    const propertyCall = dataSource.query.mock.calls[2] as [string, unknown[]];
    const addressCall = dataSource.query.mock.calls[3] as [string, unknown[]];
    const unitCall = dataSource.query.mock.calls[4] as [string, unknown[]];
    const propertySql = propertyCall[0];
    const addressSql = addressCall[0];
    const unitSql = unitCall[0];

    expect(detail).not.toHaveProperty('owners');
    expect(propertySql).not.toContain('p.*');
    expect(propertySql).not.toContain('account_number');
    expect(propertySql).not.toContain('account_holder_name');
    expect(propertySql).toContain("p.status = 'DISPONIBLE'");
    expect(propertySql).toContain('ROUND(p.latitude::numeric, 2)');
    expect(addressSql).toContain('SELECT city, state, country');
    expect(addressSql).not.toContain('street_address');
    expect(unitSql).toContain("status = 'available'");
  });

  it('ignores non-public status filters for anonymous catalog requests', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ is_published: true }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.findCatalogProperties(
      { page: 1, limit: 20, status: 'OCUPADO' },
      'acme',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(3, expect.any(String), [
      'DISPONIBLE',
    ]);
    expect(dataSource.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('ROUND(p.latitude::numeric, 2)'),
      ['DISPONIBLE', 20, 0],
    );
  });

  it('throws NotFoundException when public detail does not exist', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.findCatalogPropertyDetail(999, 'acme', undefined, true),
    ).rejects.toThrow(NotFoundException);
  });

  it('bloquea el listado de un sitio no publicado para anónimos (404)', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ is_published: false }]);

    await expect(
      service.findCatalogProperties({ page: 1, limit: 20 }, 'acme'),
    ).rejects.toThrow(NotFoundException);

    // No debe llegar a ejecutar el COUNT ni el SELECT de propiedades.
    expect(dataSource.query).toHaveBeenCalledTimes(2);
  });

  it('permite el listado de un sitio publicado para anónimos', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ is_published: true }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.findCatalogProperties({ page: 1, limit: 20 }, 'acme'),
    ).resolves.toMatchObject({ total: 0 });
  });

  it('bloquea el detalle de un sitio no publicado para anónimos (404)', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ is_published: false }]);

    await expect(service.findCatalogPropertyDetail(15, 'acme')).rejects.toThrow(
      NotFoundException,
    );

    expect(dataSource.query).toHaveBeenCalledTimes(2);
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
