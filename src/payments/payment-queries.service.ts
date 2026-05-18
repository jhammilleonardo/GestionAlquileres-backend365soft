import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentFiltersDto, PaymentSortField } from './dto';
import { Payment, PaymentStats } from './interfaces/payment.interface';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';

interface PaginatedPayments {
  payments: Payment[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class PaymentQueriesService {
  private readonly allowedSortFields = new Set<string>(
    Object.values(PaymentSortField),
  );

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async getTenantPayments(
    tenantId: number,
    tenantSlug: string,
  ): Promise<Payment[]> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    return this.dataSource.query<Payment[]>(
      `SELECT
        p.*,
        json_build_object(
          'id', prop.id,
          'title', prop.title
        ) as property,
        json_build_object(
          'id', c.id,
          'contract_number', c.contract_number,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'status', c.status
        ) as contract
      FROM ${schemaPrefix}payments p
      LEFT JOIN ${schemaPrefix}properties prop ON p.property_id = prop.id
      LEFT JOIN ${schemaPrefix}contracts c ON p.contract_id = c.id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC`,
      [tenantId],
    );
  }

  async getTenantStats(
    tenantId: number,
    tenantSlug: string,
  ): Promise<PaymentStats> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const stats = await this.dataSource.query<PaymentStats[]>(
      `SELECT
        COUNT(*)::int as total_payments,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int as total_pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::int as total_processing,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int as total_approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int as total_rejected,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int as total_failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::numeric as total_amount_pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0)::numeric as total_amount_approved,
        COALESCE(SUM(amount) FILTER (WHERE status = 'FAILED'), 0)::numeric as total_amount_failed
      FROM ${schemaPrefix}payments
      WHERE tenant_id = $1`,
      [tenantId],
    );

    return stats[0];
  }

  async getAllPayments(
    filters: PaymentFiltersDto,
    schemaName?: string,
  ): Promise<PaginatedPayments> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const filterQuery = this.buildFilterQuery(filters);
    const sortField = this.getSortField(filters);
    const sortOrder = this.getSortOrder(filters);
    const page = filters.page || 1;
    const limit = filters.limit || 50;

    const payments = await this.dataSource.query<Payment[]>(
      `SELECT
        p.*,
        json_build_object(
          'id', t.id,
          'name', t.name,
          'email', t.email
        ) as tenant,
        json_build_object(
          'id', prop.id,
          'title', prop.title
        ) as property,
        json_build_object(
          'id', c.id,
          'contract_number', c.contract_number,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'status', c.status
        ) as contract
      FROM ${schemaPrefix}payments p
      LEFT JOIN ${schemaPrefix}"user" t ON p.tenant_id = t.id
      LEFT JOIN ${schemaPrefix}properties prop ON p.property_id = prop.id
      LEFT JOIN ${schemaPrefix}contracts c ON p.contract_id = c.id
      ${filterQuery.whereClause}
      ORDER BY p.${sortField} ${sortOrder}
      LIMIT $${filterQuery.nextParamIndex} OFFSET $${filterQuery.nextParamIndex + 1}`,
      [...filterQuery.params, limit, (page - 1) * limit],
    );

    const countResult = await this.dataSource.query<{ total: number }[]>(
      `SELECT COUNT(*)::int as total FROM ${schemaPrefix}payments p ${filterQuery.whereClause}`,
      filterQuery.params,
    );

    return {
      payments,
      total: countResult[0].total,
      page,
      limit,
    };
  }

  async getAdminStats(schemaName?: string): Promise<PaymentStats> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const stats = await this.dataSource.query<PaymentStats[]>(
      `SELECT
        COUNT(*)::int as total_payments,
        COUNT(*) FILTER (WHERE status = 'PENDING')::int as total_pending,
        COUNT(*) FILTER (WHERE status = 'PROCESSING')::int as total_processing,
        COUNT(*) FILTER (WHERE status = 'APPROVED')::int as total_approved,
        COUNT(*) FILTER (WHERE status = 'REJECTED')::int as total_rejected,
        COUNT(*) FILTER (WHERE status = 'FAILED')::int as total_failed,
        COALESCE(SUM(amount) FILTER (WHERE status = 'PENDING'), 0)::numeric as total_amount_pending,
        COALESCE(SUM(amount) FILTER (WHERE status = 'APPROVED'), 0)::numeric as total_amount_approved,
        COALESCE(SUM(amount) FILTER (WHERE status = 'FAILED'), 0)::numeric as total_amount_failed
      FROM ${schemaPrefix}payments`,
    );

    return stats[0];
  }

  async exportPaymentsCsv(
    filters: PaymentFiltersDto,
    schemaName?: string,
  ): Promise<string> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const filterQuery = this.buildFilterQuery(filters);
    const sortField = this.getSortField(filters);
    const sortOrder = this.getSortOrder(filters);

    const payments = await this.dataSource.query<Record<string, unknown>[]>(
      `SELECT
        p.id,
        p.amount,
        p.currency,
        p.payment_type,
        p.payment_method,
        p.status,
        p.payment_date,
        p.due_date,
        p.reference_number,
        p.notes,
        p.created_at,
        t.name as tenant_name,
        t.email as tenant_email,
        prop.title as property_title,
        c.contract_number
      FROM ${schemaPrefix}payments p
      LEFT JOIN ${schemaPrefix}"user" t ON p.tenant_id = t.id
      LEFT JOIN ${schemaPrefix}properties prop ON p.property_id = prop.id
      LEFT JOIN ${schemaPrefix}contracts c ON p.contract_id = c.id
      ${filterQuery.whereClause}
      ORDER BY p.${sortField} ${sortOrder}`,
      filterQuery.params,
    );

    const headers = [
      'ID',
      'Monto',
      'Moneda',
      'Tipo',
      'Método',
      'Estado',
      'Fecha Pago',
      'Fecha Vencimiento',
      'Referencia',
      'Notas',
      'Creado',
      'Inquilino',
      'Email Inquilino',
      'Propiedad',
      'Contrato',
    ];

    const rows = payments.map((payment) =>
      [
        this.escapeCsv(payment.id),
        this.escapeCsv(payment.amount),
        this.escapeCsv(payment.currency),
        this.escapeCsv(payment.payment_type),
        this.escapeCsv(payment.payment_method),
        this.escapeCsv(payment.status),
        this.escapeCsv(payment.payment_date),
        this.escapeCsv(payment.due_date),
        this.escapeCsv(payment.reference_number),
        this.escapeCsv(payment.notes),
        this.escapeCsv(payment.created_at),
        this.escapeCsv(payment.tenant_name),
        this.escapeCsv(payment.tenant_email),
        this.escapeCsv(payment.property_title),
        this.escapeCsv(payment.contract_number),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
  }

  async getPaymentById(
    id: number,
    tenantId?: number,
    schemaName?: string,
  ): Promise<Payment> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const conditions = tenantId
      ? 'WHERE p.id = $1 AND p.tenant_id = $2'
      : 'WHERE p.id = $1';
    const params = tenantId ? [id, tenantId] : [id];

    const payments = await this.dataSource.query<Payment[]>(
      `SELECT
        p.*,
        json_build_object(
          'id', t.id,
          'name', t.name,
          'email', t.email
        ) as tenant,
        json_build_object(
          'id', prop.id,
          'title', prop.title
        ) as property,
        json_build_object(
          'id', c.id,
          'contract_number', c.contract_number,
          'start_date', c.start_date,
          'end_date', c.end_date,
          'status', c.status
        ) as contract
      FROM ${schemaPrefix}payments p
      LEFT JOIN ${schemaPrefix}"user" t ON p.tenant_id = t.id
      LEFT JOIN ${schemaPrefix}properties prop ON p.property_id = prop.id
      LEFT JOIN ${schemaPrefix}contracts c ON p.contract_id = c.id
      ${conditions}`,
      params,
    );

    if (payments.length === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }

    return payments[0];
  }

  private buildFilterQuery(filters: PaymentFiltersDto): {
    whereClause: string;
    params: unknown[];
    nextParamIndex: number;
  } {
    const whereConditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    const addCondition = (condition: string, value: unknown) => {
      whereConditions.push(condition.replace('?', `$${paramIndex++}`));
      params.push(value);
    };

    if (filters.status) addCondition('p.status = ?', filters.status);
    if (filters.type) addCondition('p.payment_type = ?', filters.type);
    if (filters.method) addCondition('p.payment_method = ?', filters.method);
    if (filters.currency) addCondition('p.currency = ?', filters.currency);
    if (filters.tenant_id) addCondition('p.tenant_id = ?', filters.tenant_id);
    if (filters.property_id)
      addCondition('p.property_id = ?', filters.property_id);
    if (filters.contract_id)
      addCondition('p.contract_id = ?', filters.contract_id);
    if (filters.date_from)
      addCondition('p.payment_date >= ?', filters.date_from);
    if (filters.date_to) addCondition('p.payment_date <= ?', filters.date_to);

    return {
      whereClause:
        whereConditions.length > 0
          ? 'WHERE ' + whereConditions.join(' AND ')
          : '',
      params,
      nextParamIndex: paramIndex,
    };
  }

  private getSortField(filters: PaymentFiltersDto): string {
    return filters.sort && this.allowedSortFields.has(filters.sort)
      ? filters.sort
      : PaymentSortField.CREATED_AT;
  }

  private getSortOrder(filters: PaymentFiltersDto): 'ASC' | 'DESC' {
    return filters.order === 'ASC' ? 'ASC' : 'DESC';
  }

  private escapeCsv(value: unknown): string {
    if (value === null || value === undefined) return '';
    const text =
      typeof value === 'string' ||
      typeof value === 'number' ||
      typeof value === 'boolean' ||
      typeof value === 'bigint'
        ? String(value)
        : JSON.stringify(value);

    return `"${(text ?? '').replace(/"/g, '""')}"`;
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
