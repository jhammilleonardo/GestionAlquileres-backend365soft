import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { quoteIdent } from '../common/utils/sql-identifier';
import { BCRYPT_SALT_ROUNDS } from '../common/constants/security.constants';
import {
  MoneyDecimal,
  MONEY_ROUNDING,
  type MoneyDecimalInstance,
} from '../common/money';
import { UpdateUserProfileDto } from './dto/update-user-profile.dto';

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

/** Estados de pago que cuentan como saldo pendiente (deuda del inquilino). */
const OUTSTANDING_STATUSES = ['PENDING', 'PROCESSING'];
/** Estados de pago que cuentan como cobrado. */
const PAID_STATUSES = ['APPROVED'];
/** Estados que revierten un cobro previo. */
const REVERSING_STATUSES = ['REFUNDED', 'REVERSED'];

export interface TenantLedgerLine {
  id: number;
  date: string;
  due_date: string | null;
  payment_type: string;
  payment_method: string;
  status: string;
  amount: number;
  reference_number: string | null;
  contract_number: string | null;
  /** Saldo pendiente acumulado hasta esta línea (cronológico). */
  running_balance: number;
}

export interface TenantLedger {
  tenant_id: number;
  currency: string;
  summary: {
    total_charged: number;
    total_paid: number;
    balance_due: number;
    pending_count: number;
  };
  lines: TenantLedgerLine[];
}

export interface TenantMaintenanceItem {
  id: number;
  ticket_number: string;
  title: string;
  category: string | null;
  status: string;
  priority: string;
  property_title: string | null;
  created_at: string;
  completed_at: string | null;
}

interface TenantLedgerRow {
  id: number;
  payment_date: string;
  due_date: string | null;
  payment_type: string;
  payment_method: string;
  status: string;
  amount: string;
  currency: string | null;
  reference_number: string | null;
  contract_number: string | null;
}

@Injectable()
export class UsersService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Rent ledger del inquilino: una línea por pago en orden cronológico con saldo
   * pendiente acumulado. En este modelo cada registro de pago representa a la vez
   * la obligación y su liquidación según el `status`, por eso el saldo pendiente
   * se calcula sobre los estados PENDING/PROCESSING. Montos con aritmética exacta.
   */
  async getTenantLedger(
    schemaName: string,
    tenantId: number,
  ): Promise<TenantLedger> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<TenantLedgerRow[]>(
      `SELECT
         pay.id,
         pay.payment_date,
         pay.due_date,
         pay.payment_type,
         pay.payment_method,
         pay.status,
         pay.amount::text AS amount,
         pay.currency,
         pay.reference_number,
         c.contract_number
       FROM ${schema}.payments pay
       LEFT JOIN ${schema}.contracts c ON c.id = pay.contract_id
       WHERE pay.tenant_id = $1
       ORDER BY pay.payment_date ASC, pay.id ASC`,
      [tenantId],
    );

    let totalCharged = new MoneyDecimal(0);
    let totalPaid = new MoneyDecimal(0);
    let running = new MoneyDecimal(0);
    let pendingCount = 0;
    let currency = 'BOB';

    const lines: TenantLedgerLine[] = rows.map((row) => {
      const amount = new MoneyDecimal(row.amount);
      if (row.currency) {
        currency = row.currency;
      }
      if (OUTSTANDING_STATUSES.includes(row.status)) {
        running = running.plus(amount);
        totalCharged = totalCharged.plus(amount);
        pendingCount += 1;
      } else if (PAID_STATUSES.includes(row.status)) {
        totalCharged = totalCharged.plus(amount);
        totalPaid = totalPaid.plus(amount);
      } else if (REVERSING_STATUSES.includes(row.status)) {
        running = running.minus(amount);
        totalPaid = totalPaid.minus(amount);
      }
      return {
        id: row.id,
        date: row.payment_date,
        due_date: row.due_date,
        payment_type: row.payment_type,
        payment_method: row.payment_method,
        status: row.status,
        amount: this.toMoney(amount),
        reference_number: row.reference_number,
        contract_number: row.contract_number,
        running_balance: this.toMoney(running),
      };
    });

    return {
      tenant_id: tenantId,
      currency,
      summary: {
        total_charged: this.toMoney(totalCharged),
        total_paid: this.toMoney(totalPaid),
        balance_due: this.toMoney(running),
        pending_count: pendingCount,
      },
      lines,
    };
  }

  /** Historial de solicitudes de mantenimiento del inquilino. */
  async getTenantMaintenance(
    schemaName: string,
    tenantId: number,
  ): Promise<TenantMaintenanceItem[]> {
    const schema = quoteIdent(schemaName);
    return this.dataSource.query<TenantMaintenanceItem[]>(
      `SELECT
         m.id,
         m.ticket_number,
         m.title,
         m.category,
         m.status,
         m.priority,
         p.title AS property_title,
         m.created_at,
         m.completed_at
       FROM ${schema}.maintenance_requests m
       LEFT JOIN ${schema}.properties p ON p.id = m.property_id
       WHERE m.tenant_id = $1
       ORDER BY m.created_at DESC`,
      [tenantId],
    );
  }

  private toMoney(value: MoneyDecimalInstance): number {
    return value.toDecimalPlaces(2, MONEY_ROUNDING).toNumber();
  }

  async updateProfile(
    schemaName: string,
    id: number,
    dto: UpdateUserProfileDto,
    actor: { userId: number; role: string },
  ): Promise<UserWithoutPassword> {
    this.ensureCanManageUser(id, actor);

    const patch: string[] = [];
    const params: unknown[] = [];

    if (dto.name !== undefined) {
      params.push(dto.name.trim());
      patch.push(`name = $${params.length}`);
    }

    if (dto.email !== undefined) {
      params.push(dto.email.trim().toLowerCase());
      patch.push(`email = $${params.length}`);
    }

    if (dto.phone !== undefined) {
      params.push(dto.phone.trim() || null);
      patch.push(`phone = $${params.length}`);
    }

    if (patch.length === 0) {
      const existingUser = await this.findById(schemaName, id);
      if (!existingUser) {
        throw new NotFoundException('Usuario no encontrado');
      }
      return existingUser;
    }

    params.push(id);

    try {
      const rows = await this.dataSource.query<UserWithoutPassword[]>(
        `UPDATE ${quoteIdent(schemaName)}."user"
         SET ${patch.join(', ')}, updated_at = NOW()
         WHERE id = $${params.length}
         RETURNING id, email, name, phone, role, is_active, created_at, updated_at`,
        params,
      );

      const user = rows[0];
      if (!user) {
        throw new NotFoundException('Usuario no encontrado');
      }

      return user;
    } catch (error) {
      if (
        error instanceof Error &&
        'code' in error &&
        (error as { code?: string }).code === '23505'
      ) {
        throw new BadRequestException('El correo ya está registrado');
      }
      throw error;
    }
  }

  async resetPassword(
    schemaName: string,
    id: number,
    password: string,
    currentPassword: string | undefined,
    actor: { userId: number; role: string },
  ): Promise<void> {
    this.ensureCanManageUser(id, actor);

    const rows = await this.dataSource.query<
      Array<{ id: number; password: string; role: string }>
    >(
      `SELECT id, password, role
       FROM ${quoteIdent(schemaName)}."user"
       WHERE id = $1`,
      [id],
    );

    const user = rows[0];
    if (!user) {
      throw new NotFoundException('Usuario no encontrado');
    }

    if (actor.userId === id) {
      if (!currentPassword) {
        throw new BadRequestException('La contraseña actual es requerida');
      }

      const matches = await bcrypt.compare(currentPassword, user.password);
      if (!matches) {
        throw new ForbiddenException('La contraseña actual no es correcta');
      }
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `UPDATE ${quoteIdent(schemaName)}."user"
         SET password = $1, token_version = token_version + 1, updated_at = NOW()
         WHERE id = $2`,
        [hashedPassword, id],
      );
      await manager.query(
        `UPDATE public.refresh_tokens
            SET revoked_at = NOW()
          WHERE user_id = $1
            AND tenant_slug = (
              SELECT slug FROM public.tenant WHERE schema_name = $2 LIMIT 1
            )
            AND role = $3
            AND revoked_at IS NULL`,
        [id, schemaName, user.role],
      );
    });
  }

  async findAll(schemaName: string): Promise<UserWithoutPassword[]> {
    return this.dataSource.query<UserWithoutPassword[]>(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM ${quoteIdent(schemaName)}."user"
       ORDER BY created_at DESC`,
    );
  }

  async findById(
    schemaName: string,
    id: number,
  ): Promise<UserWithoutPassword | null> {
    const rows = await this.dataSource.query<UserWithoutPassword[]>(
      `SELECT id, email, name, phone, role, is_active, created_at, updated_at
       FROM ${quoteIdent(schemaName)}."user"
       WHERE id = $1`,
      [id],
    );

    return rows[0] ?? null;
  }

  private ensureCanManageUser(
    targetUserId: number,
    actor: { userId: number; role: string },
  ): void {
    const privilegedRoles = new Set(['ADMIN', 'SUPERADMIN']);
    if (actor.userId === targetUserId || privilegedRoles.has(actor.role)) {
      return;
    }

    throw new ForbiddenException(
      'No tienes permiso para modificar este usuario',
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
