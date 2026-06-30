import { Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PropertyUpdateService } from './property-update.service';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyNotificationsService } from './property-notifications.service';
import { UpdatePropertyDto } from './dto/update-property.dto';

describe('PropertyUpdateService', () => {
  let service: PropertyUpdateService;
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
    replaceAddresses: jest.Mock;
  };
  let propertyLookupService: {
    findOne: jest.Mock;
  };
  let propertyNotificationsService: {
    notifyStatusChange: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();
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
      replaceAddresses: jest.fn().mockResolvedValue(undefined),
    };
    propertyLookupService = {
      findOne: jest.fn().mockResolvedValue({ id: 10 }),
    };
    propertyNotificationsService = {
      notifyStatusChange: jest.fn().mockResolvedValue(undefined),
    };

    service = new PropertyUpdateService(
      dataSource as unknown as DataSource,
      propertyAddressesService as unknown as PropertyAddressesService,
      propertyLookupService as unknown as PropertyLookupService,
      propertyNotificationsService as unknown as PropertyNotificationsService,
    );
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  it('rolls back the full update when replacing addresses fails', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 10,
          title: 'Casa Central',
          status: 'DISPONIBLE',
          property_type_id: 1,
        },
      ])
      .mockResolvedValueOnce([]);
    propertyAddressesService.replaceAddresses.mockRejectedValueOnce(
      new Error('address insert failed'),
    );

    const dto: UpdatePropertyDto = {
      title: 'Casa Actualizada',
      addresses: [
        {
          address_type: 'address_1',
          street_address: 'Av. Siempre Viva 123',
          country: 'Bolivia',
        },
      ],
    };

    await expect(service.update(10, dto, 'acme')).rejects.toThrow(
      'address insert failed',
    );

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(propertyAddressesService.replaceAddresses).toHaveBeenCalledWith(
      queryRunner,
      10,
      dto.addresses,
      'tenant_acme',
    );
    expect(
      propertyNotificationsService.notifyStatusChange,
    ).not.toHaveBeenCalled();
  });

  it('commits property changes before sending status notifications', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 10,
          title: 'Casa Central',
          status: 'OCUPADO',
          property_type_id: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.update(10, { status: 'DISPONIBLE' }, 'acme');

    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(
      propertyNotificationsService.notifyStatusChange,
    ).toHaveBeenCalledWith(
      {
        id: 10,
        title: 'Casa Central',
        status: 'OCUPADO',
      },
      'DISPONIBLE',
      'tenant_acme',
      'acme',
    );

    const commitOrder =
      queryRunner.commitTransaction.mock.invocationCallOrder[0];
    const notificationOrder =
      propertyNotificationsService.notifyStatusChange.mock
        .invocationCallOrder[0];
    expect(commitOrder).toBeLessThan(notificationOrder);
  });

  it('propaga la configuracion basica de reserva a las unidades de corto plazo', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 10,
          title: 'Casa Central',
          status: 'DISPONIBLE',
          property_type_id: 1,
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await service.update(
      10,
      {
        security_deposit_amount: 100,
        deposit_to_confirm_pct: 30,
        checkin_time: '14:00',
        checkout_time: '10:00',
      },
      'acme',
    );

    const unitUpdate = queryRunner.query.mock.calls.find(([sql]) =>
      String(sql).includes('UPDATE "tenant_acme".units'),
    );
    expect(unitUpdate).toBeDefined();
    expect(unitUpdate?.[0]).toContain('deposit_amount = $1');
    expect(unitUpdate?.[0]).toContain('deposit_to_confirm_pct = $2');
    expect(unitUpdate?.[0]).toContain("rental_type IN ('SHORT_TERM', 'BOTH')");
    expect(unitUpdate?.[1]).toEqual([100, 30, '14:00', '10:00', 10]);
  });

  it('rejects subtype changes that do not belong to the target type', async () => {
    dataSource.query.mockResolvedValueOnce([{ schema_name: 'tenant_acme' }]);
    queryRunner.query
      .mockResolvedValueOnce([
        {
          id: 10,
          title: 'Casa Central',
          status: 'DISPONIBLE',
          property_type_id: 1,
        },
      ])
      .mockResolvedValueOnce([{ id: 2, property_type_id: 99 }]);

    await expect(
      service.update(10, { property_subtype_id: 2 }, 'acme'),
    ).rejects.toThrow(
      'PropertySubtype does not belong to the specified PropertyType',
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
