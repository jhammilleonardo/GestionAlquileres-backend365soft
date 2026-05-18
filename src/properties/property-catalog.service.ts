import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

export interface PropertyCatalogTypeRow {
  id: number;
  name: string;
  code: string;
}

export interface PropertyCatalogSubtypeRow {
  id: number;
  name: string;
  code: string;
  property_type_id: number;
  property_type_name?: string;
  property_type_code?: string;
}

@Injectable()
export class PropertyCatalogService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getPropertyTypes(tenantSlug: string) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);

    return this.dataSource.query<PropertyCatalogTypeRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.property_types ORDER BY name ASC`,
    );
  }

  async getPropertySubtypes(tenantSlug: string, typeId?: number) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);

    if (typeId) {
      return this.dataSource.query<PropertyCatalogSubtypeRow[]>(
        `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
         FROM ${quoteIdent(schemaName)}.property_subtypes pst
         LEFT JOIN ${quoteIdent(schemaName)}.property_types pt ON pst.property_type_id = pt.id
         WHERE pst.property_type_id = $1
         ORDER BY pst.name ASC`,
        [typeId],
      );
    }

    return this.dataSource.query<PropertyCatalogSubtypeRow[]>(
      `SELECT pst.*, pt.name as property_type_name, pt.code as property_type_code
       FROM ${quoteIdent(schemaName)}.property_subtypes pst
       LEFT JOIN ${quoteIdent(schemaName)}.property_types pt ON pst.property_type_id = pt.id
       ORDER BY pst.name ASC`,
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
}
