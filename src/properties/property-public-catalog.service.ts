import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { PropertyPublicCatalogQueryService } from './property-public-catalog-query.service';
import {
  PublicCatalogAddress,
  PublicCatalogProperty,
  PublicCatalogPropertyDetail,
  PublicCatalogResult,
  PublicCatalogUnit,
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
    allowUnpublished = false,
  ): Promise<PublicCatalogResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    await this.assertSitePublished(schemaName, allowUnpublished);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const whereClause = this.propertyPublicCatalogQueryService.buildWhereClause(
      filters,
      schemaPrefix,
      allowUnpublished,
    );
    const params = [...whereClause.params];
    const unitMetricsSql = this.buildUnitMetricsLateralSql(schemaPrefix);

    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      ${unitMetricsSql}
      ${whereClause.whereSql}
    `;

    const countResult = await this.dataSource.query<CountRow[]>(
      countSql,
      whereClause.params,
    );
    const total = Number(countResult[0].count);

    const orderBy = this.propertyPublicCatalogQueryService.resolveCatalogOrder(
      filters.sort,
      filters.rental_type,
    );
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;
    let paramIndex = whereClause.nextParamIndex;

    const sql = `
      SELECT
        p.id, p.title, p.description,
        p.property_type_id, p.property_subtype_id,
        p.status,
        ROUND(p.latitude::numeric, 2) AS latitude,
        ROUND(p.longitude::numeric, 2) AS longitude,
        p.monthly_rent, p.currency, p.rental_type,
        p.bedrooms, p.bathrooms, p.square_meters, p.parking_spaces,
        p.is_furnished, p.images, p.amenities, p.included_items,
        p.view_count,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code,
        unit_metrics.total_units,
        unit_metrics.available_units,
        unit_metrics.available_short_term_units,
        unit_metrics.available_long_term_units,
        unit_metrics.min_price_per_night,
        row_to_json(first_address) AS first_address
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      ${unitMetricsSql}
      LEFT JOIN LATERAL (
        SELECT pa_first.city, pa_first.state, pa_first.country
        FROM ${schemaPrefix}property_addresses pa_first
        WHERE pa_first.property_id = p.id
          AND pa_first.address_type = 'address_1'
        ORDER BY pa_first.id ASC
        LIMIT 1
      ) first_address ON true
      ${whereClause.whereSql}
      ORDER BY ${orderBy}, p.id ASC
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
    allowUnpublished = false,
  ): Promise<PublicCatalogPropertyDetail> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    await this.assertSitePublished(schemaName, allowUnpublished);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const publicStatusSql = allowUnpublished
      ? ''
      : `AND p.status = 'DISPONIBLE'`;
    const properties = await this.dataSource.query<PublicCatalogProperty[]>(
      `SELECT
        p.id, p.title, p.description,
        p.property_type_id, p.property_subtype_id, p.status,
        ROUND(p.latitude::numeric, 2) AS latitude,
        ROUND(p.longitude::numeric, 2) AS longitude,
        p.monthly_rent, p.security_deposit_amount, p.currency, p.rental_type,
        p.bedrooms, p.bathrooms, p.square_meters, p.parking_spaces,
        p.year_built, p.is_furnished, p.images, p.amenities,
        p.included_items, p.property_rules, p.view_count,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code
       FROM ${schemaPrefix}properties p
       LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
       LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
       WHERE p.id = $1
         ${publicStatusSql}`,
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
      `SELECT city, state, country
       FROM ${schemaPrefix}property_addresses
       WHERE property_id = $1
       ORDER BY id`,
      [id],
    );

    // Unidades con su configuración de alquiler (incl. corto plazo) para el catálogo público
    const publicUnitStatusSql = allowUnpublished
      ? ''
      : `AND status = 'available'`;
    const units = await this.dataSource.query<PublicCatalogUnit[]>(
      `SELECT id, unit_number, rental_type, status,
              price_per_night, cleaning_fee, min_nights, max_nights,
              checkin_time, checkout_time
       FROM ${schemaPrefix}units
       WHERE property_id = $1
         ${publicUnitStatusSql}
       ORDER BY unit_number`,
      [id],
    );

    return {
      ...property,
      addresses,
      units,
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

  /**
   * Bloquea el catálogo de un sitio no publicado. El portal público no debe
   * exponer propiedades de un tenant que despublicó su sitio; el staff
   * autenticado del propio tenant sí puede verlas (preview).
   */
  private async assertSitePublished(
    schemaName: string,
    allowUnpublished: boolean,
  ): Promise<void> {
    if (allowUnpublished) {
      return;
    }
    const rows = await this.dataSource.query<Array<{ is_published: boolean }>>(
      `SELECT is_published FROM ${quoteIdent(schemaName)}.tenant_website LIMIT 1`,
    );
    if (!rows[0]?.is_published) {
      throw new NotFoundException('Sitio no disponible');
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

  private buildUnitMetricsLateralSql(schemaPrefix: string): string {
    return `
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*)::int AS total_units,
          COUNT(*) FILTER (WHERE u.status = 'available')::int AS available_units,
          COUNT(*) FILTER (
            WHERE u.status = 'available'
              AND u.rental_type IN ('SHORT_TERM', 'BOTH')
          )::int AS available_short_term_units,
          COUNT(*) FILTER (
            WHERE u.status = 'available'
              AND u.rental_type IN ('LONG_TERM', 'BOTH')
          )::int AS available_long_term_units,
          MIN(u.price_per_night) FILTER (
            WHERE u.status = 'available'
              AND u.rental_type IN ('SHORT_TERM', 'BOTH')
              AND u.price_per_night IS NOT NULL
          ) AS min_price_per_night
        FROM ${schemaPrefix}units u
        WHERE u.property_id = p.id
      ) unit_metrics ON true
    `;
  }
}
