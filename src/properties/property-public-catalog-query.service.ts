import { Injectable } from '@nestjs/common';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { PublicCatalogWhereClause } from './property-public-catalog.types';

@Injectable()
export class PropertyPublicCatalogQueryService {
  buildWhereClause(
    filters: FilterCatalogPropertiesDto,
  ): PublicCatalogWhereClause {
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
      const rentalType = filters.rental_type.toUpperCase();
      if (rentalType === 'SHORT_TERM' || rentalType === 'SHORT') {
        whereSql += ` AND p.rental_type IN ('SHORT_TERM', 'BOTH')`;
      } else if (rentalType === 'LONG_TERM' || rentalType === 'LONG') {
        whereSql += ` AND p.rental_type IN ('LONG_TERM', 'BOTH')`;
      } else {
        whereSql += ` AND LOWER(p.rental_type) = LOWER($${paramIndex++})`;
        params.push(filters.rental_type);
      }
    }

    return { whereSql, params, nextParamIndex: paramIndex };
  }

  resolveCatalogOrder(sort?: string): string {
    if (sort === 'price_asc') return 'p.monthly_rent ASC';
    if (sort === 'price_desc') return 'p.monthly_rent DESC';
    if (sort === 'newest') return 'p.created_at DESC';
    if (sort === 'available') return 'p.last_viewed_at DESC NULLS LAST';
    return 'p.created_at DESC';
  }
}
