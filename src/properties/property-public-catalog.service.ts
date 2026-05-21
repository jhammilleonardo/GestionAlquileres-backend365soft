import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { PropertyPublicCatalogQueryService } from './property-public-catalog-query.service';
import {
  PublicCatalogAddress,
  PublicCatalogOwner,
  PublicCatalogProperty,
  PublicCatalogPropertyDetail,
  PublicCatalogResult,
} from './property-public-catalog.types';

interface CountRow {
  count: string;
}

@Injectable()
export class PropertyPublicCatalogService {
  private readonly logger = new Logger(PropertyPublicCatalogService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly propertyPublicCatalogQueryService: PropertyPublicCatalogQueryService,
  ) {}

  async findCatalogProperties(
    filters: FilterCatalogPropertiesDto,
    tenantSlug: string,
  ): Promise<PublicCatalogResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const whereClause =
      this.propertyPublicCatalogQueryService.buildWhereClause(filters);
    const params = [...whereClause.params];

    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN ${schemaPrefix}property_addresses pa ON p.id = pa.property_id
      ${whereClause.whereSql}
    `;

    const countResult = await this.dataSource.query<CountRow[]>(
      countSql,
      whereClause.params,
    );
    const total = Number(countResult[0].count);

    const orderBy = this.propertyPublicCatalogQueryService.resolveCatalogOrder(
      filters.sort,
    );
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;
    let paramIndex = whereClause.nextParamIndex;

    const sql = `
      SELECT DISTINCT ON (p.id)
        p.id, p.title, p.description,
        p.property_type_id, p.property_subtype_id,
        p.status, p.latitude, p.longitude,
        p.monthly_rent, p.currency,
        p.bedrooms, p.bathrooms, p.square_meters, p.parking_spaces,
        p.is_furnished, p.images, p.amenities, p.included_items,
        p.view_count, p.last_viewed_at,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code,
        row_to_json(first_address) AS first_address
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN ${schemaPrefix}property_addresses pa ON p.id = pa.property_id
      LEFT JOIN LATERAL (
        SELECT *
        FROM ${schemaPrefix}property_addresses pa_first
        WHERE pa_first.property_id = p.id
          AND pa_first.address_type = 'address_1'
        ORDER BY pa_first.id ASC
        LIMIT 1
      ) first_address ON true
      ${whereClause.whereSql}
      ORDER BY p.id, ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const items = await this.dataSource.query<PublicCatalogProperty[]>(
      sql,
      params,
    );

    return {
      data: items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findCatalogPropertyDetail(
    id: number,
    tenantSlug: string,
    userIP?: string,
  ): Promise<PublicCatalogPropertyDetail> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const properties = await this.dataSource.query<PublicCatalogProperty[]>(
      `SELECT p.*,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
       FROM ${schemaPrefix}properties p
       LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
       LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
       WHERE p.id = $1`,
      [id],
    );

    if (properties.length === 0) {
      throw new NotFoundException(`Property with ID ${id} not found`);
    }

    const property = properties[0];

    this.recordPropertyView(id, userIP, schemaName).catch((error) => {
      this.logger.warn(
        `Error recording property view for ID ${id}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    });

    const addresses = await this.dataSource.query<PublicCatalogAddress[]>(
      `SELECT * FROM ${schemaPrefix}property_addresses WHERE property_id = $1 ORDER BY id`,
      [id],
    );

    const owners = await this.dataSource.query<PublicCatalogOwner[]>(
      `SELECT ro.id, ro.name, ro.company_name, ro.primary_email as email,
        ro.phone_number as phone, po.is_primary
       FROM ${schemaPrefix}property_owners po
       LEFT JOIN ${schemaPrefix}rental_owners ro ON po.rental_owner_id = ro.id
       WHERE po.property_id = $1`,
      [id],
    );

    return {
      ...property,
      addresses,
      owners,
    };
  }

  async recordPropertyView(
    propertyId: number,
    userIP?: string,
    schemaName?: string | null,
  ) {
    const schemaPrefix = this.schemaPrefix(schemaName);
    try {
      await this.dataSource.query(
        `UPDATE ${schemaPrefix}properties
         SET view_count = view_count + 1,
             last_viewed_at = NOW()
         WHERE id = $1`,
        [propertyId],
      );

      if (userIP) {
        try {
          await this.dataSource.query(
            `INSERT INTO ${schemaPrefix}property_view_logs (property_id, user_ip, viewed_at)
             VALUES ($1, $2, NOW())`,
            [propertyId, userIP],
          );
        } catch (error) {
          this.logger.warn(
            `Could not log property view: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        'Error in recordPropertyView',
        error instanceof Error ? error.stack : undefined,
      );
    }
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
