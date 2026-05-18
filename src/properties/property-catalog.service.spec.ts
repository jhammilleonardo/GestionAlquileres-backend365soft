import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyCatalogService } from './property-catalog.service';

describe('PropertyCatalogService', () => {
  let service: PropertyCatalogService;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new PropertyCatalogService(dataSource as unknown as DataSource);
  });

  it('gets property types using schema-qualified SQL', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1, name: 'Casa', code: 'HOUSE' }]);

    await expect(service.getPropertyTypes('acme')).resolves.toEqual([
      { id: 1, name: 'Casa', code: 'HOUSE' },
    ]);

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'SELECT * FROM "tenant_acme".property_types ORDER BY name ASC',
    );
  });

  it('gets subtypes filtered by type using schema-qualified SQL', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([
        {
          id: 2,
          name: 'Casa familiar',
          code: 'FAMILY_HOUSE',
          property_type_id: 1,
        },
      ]);

    await service.getPropertySubtypes('acme', 1);

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".property_subtypes pst'),
      [1],
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('throws NotFoundException when tenant does not exist', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(service.getPropertyTypes('missing')).rejects.toThrow(
      NotFoundException,
    );
  });
});
