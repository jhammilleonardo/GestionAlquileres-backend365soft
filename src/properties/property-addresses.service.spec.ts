import { QueryRunner } from 'typeorm';
import { PropertyAddressesService } from './property-addresses.service';

describe('PropertyAddressesService', () => {
  let service: PropertyAddressesService;
  let queryRunner: {
    query: jest.Mock;
  };

  beforeEach(() => {
    queryRunner = {
      query: jest.fn().mockResolvedValue(undefined),
    };
    service = new PropertyAddressesService();
  });

  it('creates addresses with nullable optional fields', async () => {
    await service.createAddresses(queryRunner as unknown as QueryRunner, 8, [
      {
        address_type: 'address_1',
        street_address: 'Av. Siempre Viva 123',
        country: 'Bolivia',
      },
    ]);

    expect(queryRunner.query).toHaveBeenCalledWith(
      `INSERT INTO property_addresses (property_id, address_type, street_address, city, state, zip_code, country, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [8, 'address_1', 'Av. Siempre Viva 123', null, null, null, 'Bolivia'],
    );
  });

  it('deletes previous rows before replacing addresses', async () => {
    await service.replaceAddresses(queryRunner as unknown as QueryRunner, 8, [
      {
        address_type: 'address_2',
        street_address: 'Calle 2',
        city: 'La Paz',
        country: 'Bolivia',
      },
    ]);

    expect(queryRunner.query).toHaveBeenNthCalledWith(
      1,
      'DELETE FROM property_addresses WHERE property_id = $1',
      [8],
    );
    expect(queryRunner.query).toHaveBeenCalledTimes(2);
  });
});
