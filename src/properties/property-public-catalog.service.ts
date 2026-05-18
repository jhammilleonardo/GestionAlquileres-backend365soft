import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';

interface CountRow {
  count: string;
}

type SqlRow = Record<string, unknown>;

@Injectable()
export class PropertyPublicCatalogService {
  private readonly logger = new Logger(PropertyPublicCatalogService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findCatalogProperties(
    filters: FilterCatalogPropertiesDto,
    tenantSlug: string,
  ) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    let whereSql = 'WHERE p.status = $1';
    const params: unknown[] = [filters.status || 'DISPONIBLE'];
    let paramIndex = 2;

    if (filters.type) {
      whereSql += ` AND LOWER(pt.code) = LOWER($${paramIndex++})`;
      params.push(filters.type);
    }

    if (filters.min_price !== undefined) {
      whereSql += ` AND p.monthly_rent >= $${paramIndex++}`;
      params.push(filters.min_price);
    }

    if (filters.max_price !== undefined) {
      whereSql += ` AND p.monthly_rent <= $${paramIndex++}`;
      params.push(filters.max_price);
    }

    if (filters.bedrooms !== undefined) {
      whereSql += ` AND p.bedrooms >= $${paramIndex++}`;
      params.push(filters.bedrooms);
    }

    if (filters.city) {
      whereSql += ` AND LOWER(pa.city) ILIKE LOWER($${paramIndex++})`;
      params.push(`%${filters.city}%`);
    }

    if (filters.country) {
      whereSql += ` AND LOWER(pa.country) = LOWER($${paramIndex++})`;
      params.push(filters.country);
    }

    if (filters.search) {
      whereSql += ` AND (
        LOWER(p.title) ILIKE LOWER($${paramIndex++}) OR
        LOWER(p.description) ILIKE LOWER($${paramIndex++})
      )`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    if (filters.rental_type && filters.rental_type !== 'any') {
      whereSql += ` AND LOWER(p.rental_type) = LOWER($${paramIndex++})`;
      params.push(filters.rental_type);
    }

    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN ${schemaPrefix}property_addresses pa ON p.id = pa.property_id
      ${whereSql}
    `;

    const countResult = await this.dataSource.query<CountRow[]>(
      countSql,
      params.slice(0, paramIndex - 1),
    );
    const total = Number(countResult[0].count);

    const orderBy = this.resolveCatalogOrder(filters.sort);
    const page = filters.page || 1;
    const limit = Math.min(filters.limit || 20, 100);
    const offset = (page - 1) * limit;

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
      ${whereSql}
      ORDER BY p.id, ${orderBy}
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const items = await this.dataSource.query<SqlRow[]>(sql, params);

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
  ) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const properties = await this.dataSource.query<SqlRow[]>(
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

    const addresses = await this.dataSource.query<SqlRow[]>(
      `SELECT * FROM ${schemaPrefix}property_addresses WHERE property_id = $1 ORDER BY id`,
      [id],
    );

    const owners = await this.dataSource.query<SqlRow[]>(
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

  private resolveCatalogOrder(sort?: string): string {
    if (sort === 'price_asc') return 'p.monthly_rent ASC';
    if (sort === 'price_desc') return 'p.monthly_rent DESC';
    if (sort === 'newest') return 'p.created_at DESC';
    if (sort === 'available') return 'p.last_viewed_at DESC NULLS LAST';
    return 'p.created_at DESC';
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
