import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import { ContractStatus } from './enums/contract-status.enum';
import type { ContractResult } from './contracts.service';

export interface ContractFilters {
  status?: ContractStatus;
  tenant_id?: number;
  property_id?: number;
}

export interface ContractMetrics {
  total_contracts: number;
  active_contracts: number;
  draft_contracts: number;
  contracts_expiring_soon: number;
  monthly_revenue: number;
  avg_rent: number;
}

interface ContractMetricsRow {
  total_contracts: string | number;
  active_contracts: string | number;
  draft_contracts: string | number;
  contracts_expiring_soon: string | number;
  monthly_revenue: string | number;
}

@Injectable()
export class ContractQueriesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async findAll(
    filters: ContractFilters,
    tenantSlug?: string,
  ): Promise<ContractResult[]> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const params: unknown[] = [];
    const where: string[] = [];

    if (filters.status) {
      params.push(filters.status);
      where.push(`c.status = $${params.length}`);
    }

    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      where.push(`c.tenant_id = $${params.length}`);
    }

    if (filters.property_id) {
      params.push(filters.property_id);
      where.push(`c.property_id = $${params.length}`);
    }

    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : '';

    return this.dataSource.query<ContractResult[]>(
      `SELECT c.*,
              p.title as property_title, p.status as property_status,
              pa.street_address, pa.city, pa.country,
              u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone
       FROM ${schemaPrefix}contracts c
       LEFT JOIN ${schemaPrefix}properties p ON c.property_id = p.id
       LEFT JOIN ${schemaPrefix}property_addresses pa ON c.property_id = pa.property_id AND pa.address_type = 'address_1'
       LEFT JOIN ${schemaPrefix}"user" u ON c.tenant_id = u.id
       ${whereSql}
       ORDER BY c.created_at DESC`,
      params,
    );
  }

  async findOne(id: number, tenantSlug?: string): Promise<ContractResult> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const result = await this.dataSource.query<ContractResult[]>(
      `SELECT c.*,
              p.title as property_title, p.description as property_description,
              p.status as property_status,
              pa.street_address, pa.city, pa.state, pa.zip_code, pa.country,
              u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone
       FROM ${schemaPrefix}contracts c
       LEFT JOIN ${schemaPrefix}properties p ON c.property_id = p.id
       LEFT JOIN ${schemaPrefix}property_addresses pa ON c.property_id = pa.property_id AND pa.address_type = 'address_1'
       LEFT JOIN ${schemaPrefix}"user" u ON c.tenant_id = u.id
       WHERE c.id = $1`,
      [id],
    );

    if (result.length === 0) {
      throw new NotFoundException(`Contrato con ID ${id} no encontrado`);
    }

    return result[0];
  }

  async getMetrics(tenantSlug?: string): Promise<ContractMetrics> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const [metrics] = await this.dataSource.query<ContractMetricsRow[]>(
      `SELECT
         COUNT(*)::int AS total_contracts,
         COUNT(*) FILTER (WHERE status = 'ACTIVO')::int AS active_contracts,
         COUNT(*) FILTER (WHERE status = 'BORRADOR')::int AS draft_contracts,
         COUNT(*) FILTER (
           WHERE status = 'ACTIVO'
             AND end_date <= CURRENT_DATE + INTERVAL '30 days'
         )::int AS contracts_expiring_soon,
         COALESCE(SUM(monthly_rent) FILTER (WHERE status = 'ACTIVO'), 0)::text AS monthly_revenue
       FROM ${schemaPrefix}contracts`,
    );

    const activeCount = Number(metrics.active_contracts);
    const revenue = Number(metrics.monthly_revenue);

    return {
      total_contracts: Number(metrics.total_contracts),
      active_contracts: activeCount,
      draft_contracts: Number(metrics.draft_contracts),
      contracts_expiring_soon: Number(metrics.contracts_expiring_soon),
      monthly_revenue: revenue,
      avg_rent: activeCount > 0 ? revenue / activeCount : 0,
    };
  }

  async getContractHistory(
    id: number,
    tenantSlug?: string,
  ): Promise<ContractResult[]> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const contract = await this.findOne(id, tenantSlug);

    if (contract.unit_id) {
      return this.findHistoryByColumn(
        schemaPrefix,
        'unit_id',
        contract.unit_id,
      );
    }

    return this.findHistoryByColumn(
      schemaPrefix,
      'property_id',
      contract.property_id,
    );
  }

  private findHistoryByColumn(
    schemaPrefix: string,
    column: 'unit_id' | 'property_id',
    value: number,
  ): Promise<ContractResult[]> {
    return this.dataSource.query<ContractResult[]>(
      `SELECT c.*,
              p.title as property_title, p.status as property_status,
              pa.street_address, pa.city, pa.state, pa.zip_code, pa.country,
              u.name as tenant_name, u.email as tenant_email, u.phone as tenant_phone
       FROM ${schemaPrefix}contracts c
       LEFT JOIN ${schemaPrefix}properties p ON c.property_id = p.id
       LEFT JOIN ${schemaPrefix}property_addresses pa ON c.property_id = pa.property_id AND pa.address_type = 'address_1'
       LEFT JOIN ${schemaPrefix}"user" u ON c.tenant_id = u.id
       WHERE c.${column} = $1
       ORDER BY c.start_date ASC`,
      [value],
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
