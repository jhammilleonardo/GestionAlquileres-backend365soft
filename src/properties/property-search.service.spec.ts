import { DataSource } from 'typeorm';
import { PropertySearchService } from './property-search.service';

describe('PropertySearchService', () => {
  let service: PropertySearchService;
  let dataSource: {
    query: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    service = new PropertySearchService(dataSource as unknown as DataSource);
  });

  it('findAll uses schema-qualified tables for tenant queries', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ count: '0' }])
      .mockResolvedValueOnce([]);

    await service.findAll({}, 'acme');

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      ['acme'],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      [],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      3,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      [10, 0],
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });
});
