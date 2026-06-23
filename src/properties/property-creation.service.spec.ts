import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyCreationService } from './property-creation.service';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyOwnersService } from './property-owners.service';
import { CreatePropertyDto } from './dto/create-property.dto';

describe('PropertyCreationService', () => {
  let service: PropertyCreationService;
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
  let propertyAddressesService: {
    createAddresses: jest.Mock;
  };
  let propertyOwnersService: {
    attachOwnersDuringCreate: jest.Mock;
  };
  let propertyLookupService: {
    findOne: jest.Mock;
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
    propertyAddressesService = {
      createAddresses: jest.fn().mockResolvedValue(undefined),
    };
    propertyOwnersService = {
      attachOwnersDuringCreate: jest.fn().mockResolvedValue(undefined),
    };
    propertyLookupService = {
      findOne: jest.fn().mockResolvedValue({ id: 55 }),
    };

    service = new PropertyCreationService(
      dataSource as unknown as DataSource,
      propertyAddressesService as unknown as PropertyAddressesService,
      propertyOwnersService as unknown as PropertyOwnersService,
      propertyLookupService as unknown as PropertyLookupService,
    );
  });

  it('creates property, addresses and owners in one transaction', async () => {
    const dto = buildCreatePropertyDto();
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 1 }]);
    queryRunner.query.mockResolvedValueOnce([{ id: 55 }]);

    await expect(service.create('acme', dto)).resolves.toEqual({ id: 55 });

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_acme".properties'),
      expect.any(Array),
    );
    expect(propertyAddressesService.createAddresses).toHaveBeenCalledWith(
      queryRunner,
      55,
      dto.addresses,
      'tenant_acme',
    );
    expect(propertyOwnersService.attachOwnersDuringCreate).toHaveBeenCalledWith(
      queryRunner,
      55,
      dto,
      'tenant_acme',
    );
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(propertyLookupService.findOne).toHaveBeenCalledWith(55, 'acme');
  });

  it('rolls back when owner attachment fails', async () => {
    const dto = buildCreatePropertyDto();
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 1 }]);
    queryRunner.query.mockResolvedValueOnce([{ id: 55 }]);
    propertyOwnersService.attachOwnersDuringCreate.mockRejectedValueOnce(
      new Error('owner failed'),
    );

    await expect(service.create('acme', dto)).rejects.toThrow('owner failed');

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(propertyLookupService.findOne).not.toHaveBeenCalled();
  });

  it('does not create a unit for long-term properties', async () => {
    const dto = buildCreatePropertyDto(); // sin rental_type → LONG_TERM
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 1 }]);
    queryRunner.query.mockResolvedValueOnce([{ id: 55 }]);

    await service.create('acme', dto);

    // Sólo el INSERT de la propiedad: ningún INSERT en units.
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).not.toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_acme".units'),
      expect.any(Array),
    );
  });

  it('creates an initial unit carrying the nightly price for short-term properties', async () => {
    const dto = {
      ...buildCreatePropertyDto(),
      rental_type: 'SHORT_TERM',
      price_per_night: 250,
      security_deposit_amount: 500,
    } as CreatePropertyDto;
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 1 }]);
    queryRunner.query
      .mockResolvedValueOnce([{ id: 55 }]) // INSERT properties
      .mockResolvedValueOnce(undefined); // INSERT units

    await service.create('acme', dto);

    const calls = queryRunner.query.mock.calls as Array<[unknown, unknown?]>;
    const unitInsert = calls.find(([sql]) =>
      String(sql).includes('INSERT INTO "tenant_acme".units'),
    );
    expect(unitInsert).toBeDefined();
    const params = unitInsert?.[1];
    expect(Array.isArray(params)).toBe(true);
    expect(params).toEqual(
      expect.arrayContaining([55, 'SHORT_TERM', 250, 500]),
    );
  });

  it('rejects subtype that does not belong to the property type', async () => {
    const dto = buildCreatePropertyDto();
    dataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_acme' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 999 }]);

    await expect(service.create('acme', dto)).rejects.toThrow(
      BadRequestException,
    );
    expect(dataSource.createQueryRunner).not.toHaveBeenCalled();
  });
});

function buildCreatePropertyDto(): CreatePropertyDto {
  return {
    title: 'Casa Central',
    property_type_id: 1,
    property_subtype_id: 2,
    addresses: [
      {
        address_type: 'address_1',
        street_address: 'Av. Siempre Viva 123',
        country: 'Bolivia',
      },
    ],
  } as CreatePropertyDto;
}
