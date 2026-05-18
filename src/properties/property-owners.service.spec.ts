import { DataSource } from 'typeorm';
import { PropertyOwnersService } from './property-owners.service';

describe('PropertyOwnersService', () => {
  let service: PropertyOwnersService;
  let dataSource: {
    query: jest.Mock;
    createQueryRunner: jest.Mock;
  };
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    dataSource = {
      query: jest.fn(),
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    service = new PropertyOwnersService(dataSource as unknown as DataSource);
  });

  it('assigns owners using schema-qualified tenant tables in a transaction', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ id: 11 }]) // property exists
      .mockResolvedValueOnce([{ id: 5 }]) // owner exists
      .mockResolvedValueOnce([]) // lock owner relations
      .mockResolvedValueOnce([]) // clear current primary
      .mockResolvedValueOnce([{ id: 99 }]) // upsert
      .mockResolvedValueOnce([{ total: '50' }]); // total ownership

    await expect(
      service.assignOwnerToProperty(
        11,
        {
          rental_owner_id: 5,
          ownership_percentage: 50,
          is_primary: true,
        },
        'acme',
      ),
    ).resolves.toEqual({ id: 99 });

    expect(dataSource.query).toHaveBeenNthCalledWith(
      1,
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      ['acme'],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id FROM "tenant_acme".properties WHERE id = $1',
      [11],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      2,
      'SELECT id FROM "tenant_acme".rental_owners WHERE id = $1',
      [5],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      'UPDATE "tenant_acme".property_owners SET is_primary = false WHERE property_id = $1',
      [11],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      5,
      expect.stringContaining('INSERT INTO "tenant_acme".property_owners'),
      [11, 5, 50, true],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('SET search_path'),
    );
  });

  it('rolls back when total ownership would exceed 100', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ id: 11 }])
      .mockResolvedValueOnce([{ id: 5 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 99 }])
      .mockResolvedValueOnce([{ total: '125' }]);

    await expect(
      service.assignOwnerToProperty(
        11,
        {
          rental_owner_id: 5,
          ownership_percentage: 75,
        },
        'acme',
      ),
    ).rejects.toThrow('Total ownership percentage cannot exceed 100');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
  });

  it('rejects create payloads with more than one primary existing owner', async () => {
    await expect(
      service.attachOwnersDuringCreate(
        queryRunner as never,
        11,
        {
          title: 'Casa',
          property_type_id: 1,
          property_subtype_id: 1,
          addresses: [],
          existing_owners: [
            { rental_owner_id: 1, is_primary: true },
            { rental_owner_id: 2, is_primary: true },
          ],
        },
        'tenant_acme',
      ),
    ).rejects.toThrow('Only one primary owner can be assigned to a property');
  });

  it('promotes a fallback primary owner when removing current primary', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ id: 7, is_primary: true }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(
      service.removeOwnerFromProperty(11, 7, 'acme'),
    ).resolves.toEqual({
      message: 'Owner removed from property successfully',
      id: 7,
    });

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'SELECT id, is_primary FROM "tenant_acme".property_owners WHERE id = $1 AND property_id = $2 FOR UPDATE',
      [7, 11],
    );
    expect(queryRunner.query).toHaveBeenNthCalledWith(
      4,
      expect.stringContaining('SET is_primary = true'),
      [11],
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });

  it('does not promote fallback owner when removing non-primary owner', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([{ id: 8, is_primary: false }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.removeOwnerFromProperty(11, 8, 'acme');

    expect(queryRunner.query).toHaveBeenCalledTimes(3);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
  });
});
