import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { CreatePropertyDto } from './dto/create-property.dto';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyOwnersService } from './property-owners.service';

interface PropertyTypeIdRow {
  id: number;
}

interface PropertySubtypeRow {
  id: number;
  property_type_id: number | string;
}

interface PropertyInsertRow {
  id: number;
}

@Injectable()
export class PropertyCreationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly propertyAddressesService: PropertyAddressesService,
    private readonly propertyOwnersService: PropertyOwnersService,
    private readonly propertyLookupService: PropertyLookupService,
  ) {}

  async create(tenantSlug: string, createPropertyDto: CreatePropertyDto) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    await this.validateTypeAndSubtype(createPropertyDto, schemaPrefix);
    this.validateAddresses(createPropertyDto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const savedProperty = await this.insertProperty(
        createPropertyDto,
        schemaPrefix,
        queryRunner,
      );

      await this.propertyAddressesService.createAddresses(
        queryRunner,
        savedProperty.id,
        createPropertyDto.addresses,
        schemaName,
      );

      await this.propertyOwnersService.attachOwnersDuringCreate(
        queryRunner,
        savedProperty.id,
        createPropertyDto,
        schemaName,
      );

      await queryRunner.commitTransaction();
      return this.propertyLookupService.findOne(savedProperty.id, tenantSlug);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async validateTypeAndSubtype(
    createPropertyDto: CreatePropertyDto,
    schemaPrefix: string,
  ): Promise<void> {
    const propertyTypes = await this.dataSource.query<PropertyTypeIdRow[]>(
      `SELECT * FROM ${schemaPrefix}property_types WHERE id = $1`,
      [createPropertyDto.property_type_id],
    );

    if (propertyTypes.length === 0) {
      throw new NotFoundException(
        `PropertyType with ID ${createPropertyDto.property_type_id} not found`,
      );
    }

    const propertySubtypes = await this.dataSource.query<PropertySubtypeRow[]>(
      `SELECT * FROM ${schemaPrefix}property_subtypes WHERE id = $1`,
      [createPropertyDto.property_subtype_id],
    );

    if (propertySubtypes.length === 0) {
      throw new NotFoundException(
        `PropertySubtype with ID ${createPropertyDto.property_subtype_id} not found`,
      );
    }

    if (
      Number(propertySubtypes[0].property_type_id) !==
      Number(createPropertyDto.property_type_id)
    ) {
      throw new BadRequestException(
        'PropertySubtype does not belong to the specified PropertyType',
      );
    }
  }

  private validateAddresses(createPropertyDto: CreatePropertyDto): void {
    if (
      !createPropertyDto.addresses ||
      createPropertyDto.addresses.length === 0
    ) {
      throw new BadRequestException('At least one address is required');
    }
  }

  private async insertProperty(
    createPropertyDto: CreatePropertyDto,
    schemaPrefix: string,
    queryRunner: QueryRunner,
  ): Promise<PropertyInsertRow> {
    const insertResult = (await queryRunner.query(
      `INSERT INTO ${schemaPrefix}properties (title, property_type_id, property_subtype_id, description,
        security_deposit_amount, account_number, account_type, account_holder_name,
        monthly_rent, currency, square_meters, bedrooms, bathrooms, parking_spaces,
        year_built, is_furnished, latitude, longitude, images, amenities, included_items, property_rules,
        created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::json, $20::json, $21::json, $22::jsonb, NOW(), NOW())
       RETURNING *`,
      [
        createPropertyDto.title,
        createPropertyDto.property_type_id,
        createPropertyDto.property_subtype_id,
        createPropertyDto.description || null,
        createPropertyDto.security_deposit_amount || null,
        createPropertyDto.account_number || null,
        createPropertyDto.account_type || null,
        createPropertyDto.account_holder_name || null,
        createPropertyDto.monthly_rent || null,
        createPropertyDto.currency || 'BOB',
        createPropertyDto.square_meters || null,
        createPropertyDto.bedrooms || null,
        createPropertyDto.bathrooms || null,
        createPropertyDto.parking_spaces || null,
        createPropertyDto.year_built || null,
        createPropertyDto.is_furnished ?? false,
        createPropertyDto.latitude || null,
        createPropertyDto.longitude || null,
        JSON.stringify([]),
        createPropertyDto.amenities
          ? JSON.stringify(createPropertyDto.amenities)
          : null,
        createPropertyDto.included_items
          ? JSON.stringify(createPropertyDto.included_items)
          : null,
        createPropertyDto.property_rules
          ? JSON.stringify(createPropertyDto.property_rules)
          : null,
      ],
    )) as PropertyInsertRow[];

    return insertResult[0];
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
