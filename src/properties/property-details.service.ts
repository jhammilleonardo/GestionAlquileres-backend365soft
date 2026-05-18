import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';

interface PropertyExistsRow {
  id: number;
}

type DetailField = keyof UpdatePropertyDetailsDto;

interface DetailFieldDefinition {
  dtoKey: DetailField;
  column: string;
  cast?: 'json' | 'jsonb';
}

const SCALAR_DETAIL_FIELDS: readonly DetailFieldDefinition[] = [
  { dtoKey: 'title', column: 'title' },
  { dtoKey: 'description', column: 'description' },
  { dtoKey: 'latitude', column: 'latitude' },
  { dtoKey: 'longitude', column: 'longitude' },
  { dtoKey: 'security_deposit_amount', column: 'security_deposit_amount' },
  { dtoKey: 'account_number', column: 'account_number' },
  { dtoKey: 'account_type', column: 'account_type' },
  { dtoKey: 'account_holder_name', column: 'account_holder_name' },
  { dtoKey: 'status', column: 'status' },
  { dtoKey: 'monthly_rent', column: 'monthly_rent' },
  { dtoKey: 'currency', column: 'currency' },
  { dtoKey: 'square_meters', column: 'square_meters' },
  { dtoKey: 'bedrooms', column: 'bedrooms' },
  { dtoKey: 'bathrooms', column: 'bathrooms' },
  { dtoKey: 'parking_spaces', column: 'parking_spaces' },
  { dtoKey: 'year_built', column: 'year_built' },
  { dtoKey: 'is_furnished', column: 'is_furnished' },
];

const JSON_DETAIL_FIELDS: readonly DetailFieldDefinition[] = [
  { dtoKey: 'images', column: 'images', cast: 'json' },
  { dtoKey: 'amenities', column: 'amenities', cast: 'json' },
  { dtoKey: 'included_items', column: 'included_items', cast: 'json' },
  { dtoKey: 'property_rules', column: 'property_rules', cast: 'jsonb' },
];

@Injectable()
export class PropertyDetailsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async updateDetails(
    id: number,
    updateDetailsDto: UpdatePropertyDetailsDto,
    schemaName?: string | null,
  ): Promise<void> {
    const tableName = this.propertyTable(schemaName);
    const properties = await this.dataSource.query<PropertyExistsRow[]>(
      `SELECT id FROM ${tableName} WHERE id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    for (const field of SCALAR_DETAIL_FIELDS) {
      if (!this.hasOwn(updateDetailsDto, field.dtoKey)) continue;

      updateFields.push(`${field.column} = $${paramIndex++}`);
      updateValues.push(updateDetailsDto[field.dtoKey]);
    }

    for (const field of JSON_DETAIL_FIELDS) {
      if (!this.hasOwn(updateDetailsDto, field.dtoKey)) continue;

      const value = updateDetailsDto[field.dtoKey];
      if (value === undefined) continue;

      updateFields.push(`${field.column} = $${paramIndex++}::${field.cast}`);
      updateValues.push(JSON.stringify(value));
    }

    if (updateFields.length === 0) return;

    updateFields.push('updated_at = NOW()');
    updateValues.push(id);

    await this.dataSource.query(
      `UPDATE ${tableName} SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`,
      updateValues,
    );
  }

  private propertyTable(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.properties` : 'properties';
  }

  private hasOwn(dto: UpdatePropertyDetailsDto, key: DetailField): boolean {
    return key in dto;
  }
}
