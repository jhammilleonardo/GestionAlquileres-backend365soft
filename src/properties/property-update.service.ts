import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyNotificationsService } from './property-notifications.service';

interface PropertyUpdateRow {
  id: number;
  title: string;
  status: string;
  property_type_id: number;
}

interface PropertyTypeIdRow {
  id: number;
}

interface PropertySubtypeRow {
  id: number;
  property_type_id: number | string;
}

@Injectable()
export class PropertyUpdateService {
  private readonly logger = new Logger(PropertyUpdateService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly propertyAddressesService: PropertyAddressesService,
    private readonly propertyLookupService: PropertyLookupService,
    private readonly propertyNotificationsService: PropertyNotificationsService,
  ) {}

  async update(
    id: number,
    updatePropertyDto: UpdatePropertyDto,
    tenantSlug?: string,
  ) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    let property: PropertyUpdateRow | null = null;
    let shouldNotifyStatusChange = false;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    try {
      property = await this.getPropertyForUpdate(queryRunner, schemaPrefix, id);
      await this.validateTypeChanges(
        queryRunner,
        schemaPrefix,
        updatePropertyDto,
        property,
      );
      await this.updatePropertyFields(
        queryRunner,
        schemaPrefix,
        id,
        updatePropertyDto,
      );
      await this.updateShortTermUnitDefaults(
        queryRunner,
        schemaPrefix,
        id,
        updatePropertyDto,
      );

      if (updatePropertyDto.addresses) {
        await this.propertyAddressesService.replaceAddresses(
          queryRunner,
          id,
          updatePropertyDto.addresses,
          schemaName,
        );
      }

      shouldNotifyStatusChange =
        'status' in updatePropertyDto &&
        updatePropertyDto.status !== property.status;

      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (this.isHttpClientError(error)) {
        throw error;
      }
      this.logger.error(
        `Error actualizando propiedad ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (property && shouldNotifyStatusChange) {
      await this.propertyNotificationsService.notifyStatusChange(
        { id, title: property.title, status: property.status },
        updatePropertyDto.status!,
        schemaName,
        tenantSlug,
      );
    }

    return this.propertyLookupService.findOne(id, tenantSlug);
  }

  private async getPropertyForUpdate(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    id: number,
  ): Promise<PropertyUpdateRow> {
    const properties = (await queryRunner.query(
      `SELECT * FROM ${schemaPrefix}properties WHERE id = $1`,
      [id],
    )) as PropertyUpdateRow[];

    const property = properties[0];
    if (!property) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    return property;
  }

  private async validateTypeChanges(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    updatePropertyDto: UpdatePropertyDto,
    property: PropertyUpdateRow,
  ): Promise<void> {
    if (updatePropertyDto.property_type_id) {
      const propertyTypes = (await queryRunner.query(
        `SELECT * FROM ${schemaPrefix}property_types WHERE id = $1`,
        [updatePropertyDto.property_type_id],
      )) as PropertyTypeIdRow[];

      if (propertyTypes.length === 0) {
        throw new NotFoundException(
          `PropertyType with ID ${updatePropertyDto.property_type_id} not found`,
        );
      }
    }

    if (!updatePropertyDto.property_subtype_id) {
      return;
    }

    const propertySubtypes = (await queryRunner.query(
      `SELECT * FROM ${schemaPrefix}property_subtypes WHERE id = $1`,
      [updatePropertyDto.property_subtype_id],
    )) as PropertySubtypeRow[];

    if (propertySubtypes.length === 0) {
      throw new NotFoundException(
        `PropertySubtype with ID ${updatePropertyDto.property_subtype_id} not found`,
      );
    }

    const typeId =
      updatePropertyDto.property_type_id || property.property_type_id;
    if (Number(propertySubtypes[0].property_type_id) !== Number(typeId)) {
      throw new BadRequestException(
        'PropertySubtype does not belong to the specified PropertyType',
      );
    }
  }

  private async updatePropertyFields(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    id: number,
    updatePropertyDto: UpdatePropertyDto,
  ): Promise<void> {
    const updateFields: string[] = [];
    const updateValues: unknown[] = [];
    let paramIndex = 1;

    const allowedFields = [
      'title',
      'description',
      'property_type_id',
      'property_subtype_id',
      'status',
      'latitude',
      'longitude',
      'security_deposit_amount',
      'account_number',
      'account_type',
      'account_holder_name',
      'monthly_rent',
      'currency',
      'square_meters',
      'bedrooms',
      'bathrooms',
      'parking_spaces',
      'year_built',
      'is_furnished',
    ];

    const dtoRecord = updatePropertyDto as Record<string, unknown>;
    for (const field of allowedFields) {
      const value = dtoRecord[field];
      if (field in updatePropertyDto && value !== undefined && value !== null) {
        updateFields.push(`${field} = $${paramIndex++}`);
        updateValues.push(value);
      }
    }

    for (const field of ['amenities', 'included_items']) {
      const value = dtoRecord[field];
      if (field in updatePropertyDto && value != null) {
        updateFields.push(`${field} = $${paramIndex++}::json`);
        updateValues.push(JSON.stringify(value));
      }
    }

    if (
      'property_rules' in updatePropertyDto &&
      updatePropertyDto.property_rules != null
    ) {
      updateFields.push(`property_rules = $${paramIndex++}::jsonb`);
      updateValues.push(JSON.stringify(updatePropertyDto.property_rules));
    }

    if ('images' in updatePropertyDto && updatePropertyDto.images != null) {
      updateFields.push(`images = $${paramIndex++}::json`);
      updateValues.push(JSON.stringify(updatePropertyDto.images));
    }

    if (updateFields.length === 0) {
      return;
    }

    updateFields.push(`updated_at = NOW()`);
    updateValues.push(id);

    const sql = `UPDATE ${schemaPrefix}properties SET ${updateFields.join(', ')} WHERE id = $${paramIndex}`;

    try {
      await queryRunner.query(sql, updateValues);
    } catch (error) {
      this.logger.error(
        `Error actualizando propiedad ${id}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  private async updateShortTermUnitDefaults(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    propertyId: number,
    updatePropertyDto: UpdatePropertyDto,
  ): Promise<void> {
    const unitFields: string[] = [];
    const unitValues: unknown[] = [];
    let paramIndex = 1;

    const assignIfPresent = (
      dtoKey: keyof UpdatePropertyDto,
      column: string,
    ) => {
      if (!(dtoKey in updatePropertyDto)) return;
      unitFields.push(`${column} = $${paramIndex++}`);
      unitValues.push(updatePropertyDto[dtoKey] ?? null);
    };

    assignIfPresent('security_deposit_amount', 'deposit_amount');
    assignIfPresent('deposit_to_confirm_pct', 'deposit_to_confirm_pct');
    assignIfPresent('checkin_time', 'checkin_time');
    assignIfPresent('checkout_time', 'checkout_time');

    if (unitFields.length === 0) {
      return;
    }

    unitFields.push('updated_at = NOW()');
    unitValues.push(propertyId);

    await queryRunner.query(
      `UPDATE ${schemaPrefix}units
          SET ${unitFields.join(', ')}
        WHERE property_id = $${paramIndex}
          AND rental_type IN ('SHORT_TERM', 'BOTH')`,
      unitValues,
    );
  }

  private isHttpClientError(error: unknown): boolean {
    return (
      typeof error === 'object' &&
      error !== null &&
      'status' in error &&
      typeof error.status === 'number' &&
      error.status < 500
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenants = await this.dataSource.query<{ schema_name: string }[]>(
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      [tenantSlug],
    );

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant with slug '${tenantSlug}' not found`);
    }

    return tenants[0].schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
