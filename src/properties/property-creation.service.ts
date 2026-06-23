import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { CreatePropertyDto } from './dto/create-property.dto';
import { RentalType } from '../units/enums/rental-type.enum';
import { PropertyAddressesService } from './property-addresses.service';
import { PropertyLookupService } from './property-lookup.service';
import { PropertyOwnersService } from './property-owners.service';

/** Identificador de la unidad creada automáticamente para una propiedad nueva. */
const DEFAULT_UNIT_NUMBER = '1';
/** Horarios de check-in/out por defecto para la unidad inicial de corto plazo. */
const DEFAULT_CHECKIN_TIME = '15:00';
const DEFAULT_CHECKOUT_TIME = '11:00';

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

      await this.createInitialShortTermUnit(
        createPropertyDto,
        savedProperty.id,
        schemaPrefix,
        queryRunner,
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
        rental_type, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19::json, $20::json, $21::json, $22::jsonb, $23, NOW(), NOW())
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
        createPropertyDto.rental_type ?? RentalType.LONG_TERM,
      ],
    )) as PropertyInsertRow[];

    return insertResult[0];
  }

  /**
   * Para propiedades de corto plazo (SHORT_TERM/BOTH), crea una unidad inicial
   * que porta el precio por noche: el catálogo y las reservas leen la tarifa
   * desde `units`, no desde la propiedad. Sin esta unidad la propiedad no sería
   * reservable. Los ajustes finos (noches mín/máx, política) se editan luego en
   * la unidad. Para LONG_TERM no se crea nada: ese flujo usa monthly_rent.
   */
  private async createInitialShortTermUnit(
    createPropertyDto: CreatePropertyDto,
    propertyId: number,
    schemaPrefix: string,
    queryRunner: QueryRunner,
  ): Promise<void> {
    const rentalType = createPropertyDto.rental_type ?? RentalType.LONG_TERM;
    const isShortTerm =
      rentalType === RentalType.SHORT_TERM || rentalType === RentalType.BOTH;
    if (!isShortTerm) return;

    await queryRunner.query(
      `INSERT INTO ${schemaPrefix}units
         (property_id, unit_number, rental_type, price_per_month, price_per_night,
          deposit_amount, status, checkin_time, checkout_time,
          cleaning_fee, min_nights, max_nights,
          weekly_discount_pct, monthly_discount_pct, weekend_adjustment_pct,
          early_bird_min_days, early_bird_discount_pct,
          last_minute_max_days, last_minute_adjustment_pct,
          advance_notice_days, max_advance_days,
          booking_mode, cancellation_policy, deposit_to_confirm_pct,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'available', $7, $8,
          $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
          COALESCE($21, 'instant'), COALESCE($22, 'moderate'), $23,
          NOW(), NOW())`,
      [
        propertyId,
        DEFAULT_UNIT_NUMBER,
        rentalType,
        createPropertyDto.monthly_rent ?? null,
        createPropertyDto.price_per_night ?? null,
        createPropertyDto.security_deposit_amount ?? null,
        createPropertyDto.checkin_time ?? DEFAULT_CHECKIN_TIME,
        createPropertyDto.checkout_time ?? DEFAULT_CHECKOUT_TIME,
        createPropertyDto.cleaning_fee ?? null,
        createPropertyDto.min_nights ?? null,
        createPropertyDto.max_nights ?? null,
        createPropertyDto.weekly_discount_pct ?? null,
        createPropertyDto.monthly_discount_pct ?? null,
        createPropertyDto.weekend_adjustment_pct ?? null,
        createPropertyDto.early_bird_min_days ?? null,
        createPropertyDto.early_bird_discount_pct ?? null,
        createPropertyDto.last_minute_max_days ?? null,
        createPropertyDto.last_minute_adjustment_pct ?? null,
        createPropertyDto.advance_notice_days ?? null,
        createPropertyDto.max_advance_days ?? null,
        createPropertyDto.booking_mode ?? null,
        createPropertyDto.cancellation_policy ?? null,
        createPropertyDto.deposit_to_confirm_pct ?? null,
      ],
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
