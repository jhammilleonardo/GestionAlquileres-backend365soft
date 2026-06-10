import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

export interface User {
  id: number;
  email: string;
  password: string;
  name: string;
  phone?: string;
  role: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export type UserWithoutPassword = Omit<User, 'password'>;

export type TenantLeaseStatus = 'active' | 'pending' | 'past' | 'none';

export interface TenantDirectoryFilters {
  id?: number;
  status?: 'approved' | 'pending' | 'active' | 'past' | 'none' | 'all';
  hasActiveContract?: boolean;
  search?: string;
}

export interface TenantDirectoryRow extends UserWithoutPassword {
  status: 'ACTIVE' | 'INACTIVE';
  lease_status: TenantLeaseStatus;
  application_count: number;
  approved_applications: number;
  active_contracts: number;
  pending_payments: number;
  balance_due: number;
  total_paid: number;
  current_contract_id: number | null;
  contract_number: string | null;
  contract_status: string | null;
  start_date: string | null;
  end_date: string | null;
  monthly_rent: number | null;
  currency: string | null;
  property_id: number | null;
  property_title: string | null;
  unit_id: number | null;
  unit_number: string | null;
}

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async findAll(schemaName: string): Promise<UserWithoutPassword[]> {
    return this.dataSource.query<UserWithoutPassword[]>(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM ${quoteIdent(schemaName)}."user"
       ORDER BY created_at DESC`,
    );
  }

  async findAdmins(): Promise<UserWithoutPassword[]> {
    // Nota: El schema se maneja por el search_path en el middleware
    return this.dataSource.query<UserWithoutPassword[]>(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM "user"
       WHERE role = 'ADMIN' AND is_active = true`,
    );
  }

  async findTenants(
    schemaName: string,
    filters?: TenantDirectoryFilters,
  ): Promise<TenantDirectoryRow[]> {
    const schema = quoteIdent(schemaName);
    const params: unknown[] = [];
    const where: string[] = [`u.role = 'INQUILINO'`];

    if (filters?.id) {
      params.push(filters.id);
      where.push(`u.id = $${params.length}`);
    }

    if (filters?.status === 'approved') {
      where.push(`EXISTS (
        SELECT 1 FROM ${schema}.rental_applications ra_status
        WHERE ra_status.applicant_id = u.id AND ra_status.status = 'APROBADA'
      )`);
    } else if (filters?.status === 'pending') {
      where.push(`EXISTS (
        SELECT 1 FROM ${schema}.rental_applications ra_status
        WHERE ra_status.applicant_id = u.id AND ra_status.status = 'PENDIENTE'
      )`);
    } else if (filters?.status === 'active') {
      where.push(`current_contract.id IS NOT NULL`);
    } else if (filters?.status === 'past') {
      where.push(
        `current_contract.id IS NULL AND contract_counts.past_contracts > 0`,
      );
    } else if (filters?.status === 'none') {
      where.push(
        `current_contract.id IS NULL AND contract_counts.total_contracts = 0`,
      );
    }

    if (filters?.hasActiveContract === true) {
      where.push(`current_contract.id IS NOT NULL`);
    } else if (filters?.hasActiveContract === false) {
      where.push(`current_contract.id IS NULL`);
    }

    if (filters?.search) {
      params.push(`%${filters.search}%`);
      const idx = params.length;
      where.push(`(
        u.name ILIKE $${idx} OR
        u.email ILIKE $${idx} OR
        COALESCE(u.phone, '') ILIKE $${idx} OR
        COALESCE(current_contract.contract_number, '') ILIKE $${idx} OR
        COALESCE(p.title, '') ILIKE $${idx} OR
        COALESCE(unit.unit_number, '') ILIKE $${idx}
      )`);
    }

    const query = `
      SELECT
        u.id,
        u.email,
        u.name,
        u.phone,
        u.role,
        u.is_active,
        CASE WHEN u.is_active THEN 'ACTIVE' ELSE 'INACTIVE' END AS status,
        u.created_at,
        u.updated_at,
        COALESCE(application_counts.application_count, 0)::int AS application_count,
        COALESCE(application_counts.approved_applications, 0)::int AS approved_applications,
        COALESCE(contract_counts.active_contracts, 0)::int AS active_contracts,
        COALESCE(payment_totals.pending_payments, 0)::int AS pending_payments,
        COALESCE(payment_totals.balance_due, 0)::numeric AS balance_due,
        COALESCE(payment_totals.total_paid, 0)::numeric AS total_paid,
        current_contract.id AS current_contract_id,
        current_contract.contract_number,
        current_contract.status AS contract_status,
        CASE
          WHEN current_contract.id IS NOT NULL THEN 'active'
          WHEN contract_counts.past_contracts > 0 THEN 'past'
          WHEN application_counts.pending_applications > 0 THEN 'pending'
          ELSE 'none'
        END AS lease_status,
        current_contract.start_date,
        current_contract.end_date,
        current_contract.monthly_rent::numeric,
        current_contract.currency,
        p.id AS property_id,
        p.title AS property_title,
        unit.id AS unit_id,
        unit.unit_number
      FROM ${schema}."user" u
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS application_count,
          COUNT(*) FILTER (WHERE ra.status = 'APROBADA') AS approved_applications,
          COUNT(*) FILTER (WHERE ra.status = 'PENDIENTE') AS pending_applications
        FROM ${schema}.rental_applications ra
        WHERE ra.applicant_id = u.id
      ) application_counts ON true
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) AS total_contracts,
          COUNT(*) FILTER (WHERE c.status IN ('ACTIVO', 'POR_VENCER', 'FIRMADO')) AS active_contracts,
          COUNT(*) FILTER (WHERE c.status IN ('VENCIDO', 'FINALIZADO', 'RENOVADO', 'CANCELADO')) AS past_contracts
        FROM ${schema}.contracts c
        WHERE c.tenant_id = u.id
      ) contract_counts ON true
      LEFT JOIN LATERAL (
        SELECT c.*
        FROM ${schema}.contracts c
        WHERE c.tenant_id = u.id
          AND c.status IN ('ACTIVO', 'POR_VENCER', 'FIRMADO', 'PENDIENTE', 'BORRADOR')
        ORDER BY
          CASE c.status
            WHEN 'ACTIVO' THEN 1
            WHEN 'POR_VENCER' THEN 2
            WHEN 'FIRMADO' THEN 3
            WHEN 'PENDIENTE' THEN 4
            ELSE 5
          END,
          c.end_date DESC NULLS LAST,
          c.created_at DESC
        LIMIT 1
      ) current_contract ON true
      LEFT JOIN ${schema}.properties p ON p.id = current_contract.property_id
      LEFT JOIN ${schema}.units unit ON unit.id = current_contract.unit_id
      LEFT JOIN LATERAL (
        SELECT
          COUNT(*) FILTER (WHERE pay.status IN ('PENDING', 'PROCESSING')) AS pending_payments,
          SUM(pay.amount) FILTER (WHERE pay.status IN ('PENDING', 'PROCESSING')) AS balance_due,
          SUM(pay.amount) FILTER (WHERE pay.status = 'APPROVED') AS total_paid
        FROM ${schema}.payments pay
        WHERE pay.tenant_id = u.id
      ) payment_totals ON true
      WHERE ${where.join(' AND ')}
      ORDER BY
        CASE WHEN current_contract.id IS NOT NULL THEN 0 ELSE 1 END,
        u.created_at DESC
    `;

    return this.dataSource.query<TenantDirectoryRow[]>(query, params);
  }

  async findTenantById(
    schemaName: string,
    id: number,
  ): Promise<TenantDirectoryRow | null> {
    const result = await this.findTenants(schemaName, { id });
    return result.length > 0 ? result[0] : null;
  }
}
