import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { FilterPropertiesDto } from './dto/filter-properties.dto';

interface CountRow {
  count: string;
}

type SqlRow = Record<string, unknown>;

@Injectable()
export class PropertySearchService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findAll(filters?: FilterPropertiesDto, tenantSlug?: string) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    let whereSql = 'WHERE 1=1';
    const params: unknown[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      whereSql += ` AND p.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.property_type_id) {
      whereSql += ` AND p.property_type_id = $${paramIndex++}`;
      params.push(filters.property_type_id);
    }

    if (filters?.property_subtype_id) {
      whereSql += ` AND p.property_subtype_id = $${paramIndex++}`;
      params.push(filters.property_subtype_id);
    }

    if (filters?.city) {
      whereSql += ` AND pa.city ILIKE $${paramIndex++}`;
      params.push(`%${filters.city}%`);
    }

    if (filters?.country) {
      whereSql += ` AND pa.country = $${paramIndex++}`;
      params.push(filters.country);
    }

    if (filters?.search) {
      whereSql += ` AND (p.title ILIKE $${paramIndex++} OR p.description ILIKE $${paramIndex++})`;
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    const countSql = `
      SELECT COUNT(DISTINCT p.id) as count
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_addresses pa ON p.id = pa.property_id
      ${whereSql}
    `;

    const countResult = await this.dataSource.query<CountRow[]>(countSql, [
      ...params,
    ]);
    const total = Number(countResult[0].count);

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'title',
      'status',
      'monthly_rent',
      'bedrooms',
      'bathrooms',
      'square_meters',
      'year_built',
    ];
    const sortBy =
      filters?.sort_by && allowedSortFields.includes(filters.sort_by)
        ? filters.sort_by
        : 'created_at';
    const sortOrder = filters?.sort_order === 'ASC' ? 'ASC' : 'DESC';
    const page = filters?.page || 1;
    const limit = filters?.limit || 10;
    const offset = (page - 1) * limit;

    const sql = `
      SELECT p.id, p.title, p.description, p.property_type_id, p.property_subtype_id,
        p.status, p.latitude, p.longitude, p.security_deposit_amount,
        p.account_number, p.account_type, p.account_holder_name,
        p.images, p.amenities, p.included_items,
        p.monthly_rent, p.currency, p.square_meters, p.bedrooms, p.bathrooms,
        p.parking_spaces, p.year_built, p.is_furnished, p.property_rules,
        p.rental_type,
        p.created_at, p.updated_at,
        pt.name as property_type_name, pt.code as property_type_code,
        pst.name as property_subtype_name, pst.code as property_subtype_code,
        CASE WHEN p.status = 'DISPONIBLE' THEN true ELSE false END as active,
        (
          SELECT MIN(u.price_per_night)
          FROM ${schemaPrefix}units u
          WHERE u.property_id = p.id AND u.price_per_night IS NOT NULL
        ) AS min_price_per_night,
        COALESCE(
          jsonb_agg(DISTINCT to_jsonb(pa_all))
            FILTER (WHERE pa_all.id IS NOT NULL),
          '[]'::jsonb
        ) AS addresses
      FROM ${schemaPrefix}properties p
      LEFT JOIN ${schemaPrefix}property_types pt ON p.property_type_id = pt.id
      LEFT JOIN ${schemaPrefix}property_subtypes pst ON p.property_subtype_id = pst.id
      LEFT JOIN ${schemaPrefix}property_addresses pa ON p.id = pa.property_id
      LEFT JOIN ${schemaPrefix}property_addresses pa_all ON p.id = pa_all.property_id
      ${whereSql}
      GROUP BY p.id, pt.id, pst.id
      ORDER BY p.${sortBy} ${sortOrder}, p.id ASC
      LIMIT $${paramIndex++} OFFSET $${paramIndex++}
    `;

    params.push(limit, offset);

    const items = await this.dataSource.query<SqlRow[]>(sql, params);

    return {
      items,
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    };
  }

  async findAvailable(filters?: FilterPropertiesDto, tenantSlug?: string) {
    return this.findAll({ ...filters, status: 'DISPONIBLE' }, tenantSlug);
  }

  async findByTenant(
    userId: number,
    filters?: FilterPropertiesDto,
    tenantSlug?: string,
  ) {
    void filters;
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    return this.dataSource.query<SqlRow[]>(
      `SELECT DISTINCT p.*
       FROM ${schemaPrefix}properties p
       INNER JOIN ${schemaPrefix}contracts c ON c.property_id = p.id
       WHERE c.tenant_id = $1
         AND c.status IN ('ACTIVE', 'ACTIVO')
       ORDER BY p.id ASC`,
      [userId],
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
