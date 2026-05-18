import { NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyDetailsService } from './property-details.service';

describe('PropertyDetailsService', () => {
  let service: PropertyDetailsService;
  let dataSource: {
    query: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    service = new PropertyDetailsService(dataSource as unknown as DataSource);
  });

  it('updates detail fields using an explicit tenant schema', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([]);

    await service.updateDetails(
      12,
      {
        title: 'Casa Norte',
        images: ['properties/acme/12/a.jpg'],
        property_rules: {
          pets_allowed: true,
          smoking_allowed: false,
        },
      },
      'tenant_acme',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM "tenant_acme".properties WHERE id = $1',
      [12],
    );
    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE "tenant_acme".properties SET title = $1, images = $2::json, property_rules = $3::jsonb, updated_at = NOW() WHERE id = $4',
      [
        'Casa Norte',
        JSON.stringify(['properties/acme/12/a.jpg']),
        JSON.stringify({
          pets_allowed: true,
          smoking_allowed: false,
        }),
        12,
      ],
    );
  });

  it('throws when property does not exist', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.updateDetails(99, { title: 'No existe' }, 'tenant_acme'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('allows clearing JSON detail fields with null', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 12 }])
      .mockResolvedValueOnce([]);

    await service.updateDetails(
      12,
      {
        images: null,
        amenities: null,
        property_rules: null,
      },
      'tenant_acme',
    );

    expect(dataSource.query).toHaveBeenNthCalledWith(
      2,
      'UPDATE "tenant_acme".properties SET images = $1::json, amenities = $2::json, property_rules = $3::jsonb, updated_at = NOW() WHERE id = $4',
      [JSON.stringify(null), JSON.stringify(null), JSON.stringify(null), 12],
    );
  });

  it('does not run UPDATE when dto has no persisted fields', async () => {
    dataSource.query.mockResolvedValueOnce([{ id: 12 }]);

    await service.updateDetails(12, {}, 'tenant_acme');

    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });
});
