import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyLookupService } from './property-lookup.service';

describe('PropertyLookupService', () => {
  let service: PropertyLookupService;
  let dataSource: { query: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new PropertyLookupService(dataSource as unknown as DataSource);
  });

  it('finds a property using schema-qualified queries without mutating search_path', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([
        {
          id: 10,
          title: 'Casa Central',
          description: null,
          property_type_id: 1,
          property_subtype_id: 2,
          status: 'DISPONIBLE',
          rental_type: 'SHORT_TERM',
          images: [],
          amenities: [],
          included_items: [],
          property_type_name: 'Casa',
          property_type_code: 'HOUSE',
          property_subtype_name: 'Casa familiar',
          property_subtype_code: 'FAMILY_HOUSE',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(service.findOne(10, 'acme')).resolves.toMatchObject({
      id: 10,
      title: 'Casa Central',
      rental_type: 'SHORT_TERM',
      units: [],
      property_type: {
        id: 1,
        name: 'Casa',
      },
    });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      ['acme'],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('FROM "tenant_acme".properties p'),
      [10],
    );
    expect(dataSource.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('throws NotFoundException when property does not exist', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([]);

    await expect(service.findOne(999, 'acme')).rejects.toThrow(
      NotFoundException,
    );
  });
});
