import { Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { CreatePropertyAddressDto } from './dto/create-property.dto';

@Injectable()
export class PropertyAddressesService {
  async createAddresses(
    queryRunner: QueryRunner,
    propertyId: number,
    addresses: CreatePropertyAddressDto[],
    schemaName?: string | null,
  ): Promise<void> {
    for (const addressDto of addresses) {
      await this.insertAddress(queryRunner, propertyId, addressDto, schemaName);
    }
  }

  async replaceAddresses(
    queryRunner: QueryRunner,
    propertyId: number,
    addresses: CreatePropertyAddressDto[],
    schemaName?: string | null,
  ): Promise<void> {
    const tablePrefix = this.tablePrefix(schemaName);
    await queryRunner.query(
      `DELETE FROM ${tablePrefix}property_addresses WHERE property_id = $1`,
      [propertyId],
    );
    await this.createAddresses(queryRunner, propertyId, addresses, schemaName);
  }

  private async insertAddress(
    queryRunner: QueryRunner,
    propertyId: number,
    addressDto: CreatePropertyAddressDto,
    schemaName?: string | null,
  ): Promise<void> {
    const tablePrefix = this.tablePrefix(schemaName);
    await queryRunner.query(
      `INSERT INTO ${tablePrefix}property_addresses (property_id, address_type, street_address, city, state, zip_code, country, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
      [
        propertyId,
        addressDto.address_type,
        addressDto.street_address,
        addressDto.city || null,
        addressDto.state || null,
        addressDto.zip_code || null,
        addressDto.country,
      ],
    );
  }

  private tablePrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
