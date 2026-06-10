import { Injectable } from '@nestjs/common';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { PublicCatalogWhereClause } from './property-public-catalog.types';

@Injectable()
export class PropertyPublicCatalogQueryService {
  buildWhereClause(
    filters: FilterCatalogPropertiesDto,
    schemaPrefix = '',
  ): PublicCatalogWhereClause {
    let whereSql = 'WHERE p.status = $1';
    const params: unknown[] = [filters.status || 'DISPONIBLE'];
    let paramIndex = 2;

    if (filters.type) {
      whereSql += ` AND LOWER(pt.code) = LOWER($${paramIndex++})`;
      params.push(filters.type);
    }

    const rentalType = this.normalizeRentalType(filters.rental_type);

    if (filters.min_price !== undefined) {
      const placeholder = `$${paramIndex++}`;
      whereSql += ` AND ${this.buildPriceExpression(rentalType)} >= ${placeholder}`;
      params.push(filters.min_price);
    }

    if (filters.max_price !== undefined) {
      const placeholder = `$${paramIndex++}`;
      whereSql += ` AND ${this.buildPriceExpression(rentalType)} <= ${placeholder}`;
      params.push(filters.max_price);
    }

    if (filters.bedrooms !== undefined) {
      whereSql += ` AND p.bedrooms >= $${paramIndex++}`;
      params.push(filters.bedrooms);
    }

    if (filters.city) {
      whereSql += ` AND EXISTS (
        SELECT 1
        FROM ${schemaPrefix}property_addresses pa_search
        WHERE pa_search.property_id = p.id
          AND LOWER(pa_search.city) ILIKE LOWER($${paramIndex++})
      )`;
      params.push(`%${filters.city}%`);
    }

    if (filters.country) {
      const countryVariants = this.buildCountryVariants(filters.country);
      whereSql += ` AND EXISTS (
        SELECT 1
        FROM ${schemaPrefix}property_addresses pa_search
        WHERE pa_search.property_id = p.id
          AND LOWER(pa_search.country) = ANY($${paramIndex++}::text[])
      )`;
      params.push(countryVariants);
    }

    if (filters.search) {
      whereSql += ` AND (
        LOWER(p.title) ILIKE LOWER($${paramIndex++}) OR
        LOWER(p.description) ILIKE LOWER($${paramIndex++}) OR
        EXISTS (
          SELECT 1
          FROM ${schemaPrefix}property_addresses pa_search
          WHERE pa_search.property_id = p.id
            AND (
              LOWER(pa_search.street_address) ILIKE LOWER($${paramIndex}) OR
              LOWER(pa_search.city) ILIKE LOWER($${paramIndex}) OR
              LOWER(pa_search.state) ILIKE LOWER($${paramIndex})
            )
        )
      )`;
      params.push(
        `%${filters.search}%`,
        `%${filters.search}%`,
        `%${filters.search}%`,
      );
      paramIndex++;
    }

    if (filters.rental_type && filters.rental_type !== 'any') {
      if (rentalType === 'SHORT_TERM' || rentalType === 'SHORT') {
        whereSql += ` AND p.rental_type IN ('SHORT_TERM', 'BOTH')
          AND (
            COALESCE(unit_metrics.total_units, 0) = 0 OR
            COALESCE(unit_metrics.available_short_term_units, 0) > 0
          )`;
      } else if (rentalType === 'LONG_TERM' || rentalType === 'LONG') {
        whereSql += ` AND p.rental_type IN ('LONG_TERM', 'BOTH')
          AND (
            COALESCE(unit_metrics.total_units, 0) = 0 OR
            COALESCE(unit_metrics.available_long_term_units, 0) > 0
          )`;
      } else {
        whereSql += ` AND LOWER(p.rental_type) = LOWER($${paramIndex++})`;
        params.push(filters.rental_type);
      }
    }

    return { whereSql, params, nextParamIndex: paramIndex };
  }

  resolveCatalogOrder(sort?: string, rentalType?: string): string {
    const normalizedRentalType = this.normalizeRentalType(rentalType);
    const priceExpression = this.buildPriceExpression(normalizedRentalType);

    if (sort === 'price_asc')
      return `${priceExpression} ASC NULLS LAST, p.created_at DESC`;
    if (sort === 'price_desc')
      return `${priceExpression} DESC NULLS LAST, p.created_at DESC`;
    if (sort === 'newest') return 'p.created_at DESC';
    if (sort === 'available') {
      return 'unit_metrics.available_units DESC, p.created_at DESC';
    }
    return 'p.created_at DESC';
  }

  private normalizeRentalType(rentalType?: string): string {
    return (rentalType ?? 'any').toUpperCase();
  }

  private buildPriceExpression(rentalType: string): string {
    if (rentalType === 'SHORT_TERM' || rentalType === 'SHORT') {
      return 'COALESCE(unit_metrics.min_price_per_night, p.monthly_rent)';
    }

    if (rentalType === 'LONG_TERM' || rentalType === 'LONG') {
      return 'p.monthly_rent';
    }

    return 'p.monthly_rent';
  }

  private buildCountryVariants(country: string): string[] {
    const normalized = country.trim().toLowerCase();
    const variants = new Set<string>([normalized]);
    const countryAliases: Record<string, string[]> = {
      bo: ['bolivia'],
      bolivia: ['bo'],
      us: ['united states', 'usa', 'estados unidos'],
      usa: ['us', 'united states', 'estados unidos'],
      'united states': ['us', 'usa', 'estados unidos'],
      'estados unidos': ['us', 'usa', 'united states'],
      gt: ['guatemala'],
      guatemala: ['gt'],
      hn: ['honduras'],
      honduras: ['hn'],
    };

    for (const alias of countryAliases[normalized] ?? []) {
      variants.add(alias);
    }

    return [...variants];
  }
}
