import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { randomBytes } from 'crypto';
import { CreateRentalOwnerDto } from './dto/create-rental-owner.dto';
import { UpdateRentalOwnerDto } from './dto/update-rental-owner.dto';
import { AssignOwnerPropertyDto } from './dto/assign-owner-property.dto';
import { AuthService } from '../auth/auth.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';

/** Estados de contrato que implican una propiedad "activa" para el propietario. */
const ACTIVE_PROPERTY_STATUSES = [
  'DISPONIBLE',
  'OCUPADO',
  'RESERVADO',
  'MANTENIMIENTO',
];

@Injectable()
export class RentalOwnersService {
  private readonly logger = new Logger(RentalOwnersService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly authService: AuthService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  // ─── Listado ─────────────────────────────────────────────────────────────

  /**
   * Lista todos los propietarios con:
   * - Cantidad de propiedades asignadas
   * - Saldo pendiente: suma de pagos CONFIRMADOS del mes actual para sus propiedades
   */
  async findAll(): Promise<RentalOwnerSummary[]> {
    const rows = await this.dataSource.query<RentalOwnerRow[]>(`
      SELECT
        ro.*,
        COUNT(DISTINCT po.property_id)::int      AS property_count,
        COALESCE(SUM(p.amount) FILTER (
          WHERE p.status = 'CONFIRMED'
            AND DATE_TRUNC('month', p.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
        ), 0)::numeric                            AS pending_balance,
        EXISTS (
          SELECT 1 FROM "user" u
          WHERE u.email = ro.primary_email AND u.role = 'PROPIETARIO'
        )                                         AS has_account
      FROM rental_owners ro
      LEFT JOIN property_owners po ON po.rental_owner_id = ro.id
      LEFT JOIN payments p
             ON p.property_id = po.property_id
      GROUP BY ro.id
      ORDER BY ro.name ASC
    `);

    return rows.map((row) => this.toSummary(row));
  }

  // ─── CRUD ────────────────────────────────────────────────────────────────

  async findOne(id: number): Promise<RentalOwnerRow> {
    const rows = await this.dataSource.query<RentalOwnerRow[]>(
      `SELECT ro.*,
              COUNT(DISTINCT po.property_id)::int AS property_count
       FROM rental_owners ro
       LEFT JOIN property_owners po ON po.rental_owner_id = ro.id
       WHERE ro.id = $1
       GROUP BY ro.id`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Propietario con ID ${id} no encontrado`);
    }

    return rows[0];
  }

  async create(dto: CreateRentalOwnerDto): Promise<RentalOwnerRow> {
    await this.assertEmailUnique(dto.primary_email);

    const { bank_details, ...personal } = dto;
    const bank = bank_details ?? {};

    const result = await this.dataSource.query<RentalOwnerRow[]>(
      `INSERT INTO rental_owners (
         name, company_name, is_company, primary_email, phone_number,
         secondary_email, secondary_phone, notes,
         bank_name, account_number, account_type, account_holder_name, cbu_iban,
         is_active, created_at, updated_at
       )
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,true,NOW(),NOW())
       RETURNING *`,
      [
        personal.name,
        personal.company_name ?? null,
        personal.is_company ?? false,
        personal.primary_email,
        personal.phone_number,
        personal.secondary_email ?? null,
        personal.secondary_phone ?? null,
        personal.notes ?? '',
        bank.bank_name ?? null,
        bank.account_number ?? null,
        bank.account_type ?? null,
        bank.account_holder_name ?? null,
        bank.cbu_iban ?? null,
      ],
    );

    await this.auditLogsService.log({
      action: AuditAction.CREATED,
      entityType: 'rental_owner',
      entityId: result[0].id,
      newValues: { name: dto.name, primary_email: dto.primary_email },
    });

    return result[0];
  }

  async update(id: number, dto: UpdateRentalOwnerDto): Promise<RentalOwnerRow> {
    await this.findOne(id); // garantiza existencia

    if (dto.primary_email) {
      await this.assertEmailUnique(dto.primary_email, id);
    }

    const { bank_details, ...rest } = dto;
    const bank = bank_details ?? {};

    // Construimos el SET dinámicamente para no pisar columnas no enviadas
    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    const scalar: Record<string, unknown> = {
      name: rest.name,
      company_name: rest.company_name,
      is_company: rest.is_company,
      primary_email: rest.primary_email,
      phone_number: rest.phone_number,
      secondary_email: rest.secondary_email,
      secondary_phone: rest.secondary_phone,
      notes: rest.notes,
      is_active: rest.is_active,
    };

    for (const [col, val] of Object.entries(scalar)) {
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    const bankScalar: Record<string, unknown> = {
      bank_name: bank.bank_name,
      account_number: bank.account_number,
      account_type: bank.account_type,
      account_holder_name: bank.account_holder_name,
      cbu_iban: bank.cbu_iban,
    };

    for (const [col, val] of Object.entries(bankScalar)) {
      if (val !== undefined) {
        fields.push(`${col} = $${idx++}`);
        values.push(val);
      }
    }

    if (fields.length === 0) {
      return this.findOne(id);
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    await this.dataSource.query(
      `UPDATE rental_owners SET ${fields.join(', ')} WHERE id = $${idx}`,
      values,
    );

    await this.auditLogsService.log({
      action: AuditAction.UPDATED,
      entityType: 'rental_owner',
      entityId: id,
      newValues: { ...scalar },
    });

    return this.findOne(id);
  }

  /**
   * Desactiva el propietario (soft delete).
   * Bloquea si todavía tiene propiedades activas asignadas.
   */
  async deactivate(id: number): Promise<{ message: string }> {
    const owner = await this.findOne(id);

    if (!owner.is_active) {
      return { message: `Propietario ${id} ya estaba inactivo` };
    }

    await this.assertNoActiveProperties(id);

    await this.dataSource.query(
      `UPDATE rental_owners SET is_active = false, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    await this.auditLogsService.log({
      action: AuditAction.STATUS_CHANGED,
      entityType: 'rental_owner',
      entityId: id,
      newValues: { is_active: false },
    });

    return { message: `Propietario ${id} desactivado correctamente` };
  }

  // ─── Sub-recursos ─────────────────────────────────────────────────────────

  /**
   * Propiedades asignadas a un propietario con porcentaje de participación.
   */
  async getProperties(ownerId: number): Promise<OwnerPropertyRow[]> {
    await this.findOne(ownerId); // garantiza existencia

    return this.dataSource.query<OwnerPropertyRow[]>(
      `SELECT
         po.id AS relation_id,
         p.id, p.title, p.status, p.monthly_rent, p.currency,
         po.ownership_percentage, po.is_primary,
         pa.street_address, pa.city, pa.country
       FROM property_owners po
       JOIN properties p ON p.id = po.property_id
       LEFT JOIN property_addresses pa
              ON pa.property_id = p.id AND pa.address_type = 'address_1'
       WHERE po.rental_owner_id = $1
       ORDER BY po.is_primary DESC, p.title ASC`,
      [ownerId],
    );
  }

  async assignProperty(
    ownerId: number,
    dto: AssignOwnerPropertyDto,
  ): Promise<{ message: string }> {
    await this.findOne(ownerId);

    const propertyRows = await this.dataSource.query<
      { id: number; title: string }[]
    >(`SELECT id, title FROM properties WHERE id = $1`, [dto.property_id]);
    if (propertyRows.length === 0) {
      throw new NotFoundException(
        `Propiedad con ID ${dto.property_id} no encontrada`,
      );
    }

    const existingRows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM property_owners WHERE rental_owner_id = $1 AND property_id = $2`,
      [ownerId, dto.property_id],
    );

    if (dto.is_primary === true) {
      await this.dataSource.query(
        `UPDATE property_owners
         SET is_primary = false
         WHERE property_id = $1 AND rental_owner_id != $2`,
        [dto.property_id, ownerId],
      );
    }

    if (existingRows.length > 0) {
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      if (dto.ownership_percentage !== undefined) {
        fields.push(`ownership_percentage = $${idx++}`);
        values.push(dto.ownership_percentage);
      }
      if (dto.is_primary !== undefined) {
        fields.push(`is_primary = $${idx++}`);
        values.push(dto.is_primary);
      }

      if (fields.length > 0) {
        values.push(existingRows[0].id);
        await this.dataSource.query(
          `UPDATE property_owners SET ${fields.join(', ')} WHERE id = $${idx}`,
          values,
        );
      }

      return {
        message: 'Asignación actualizada correctamente',
      };
    }

    await this.dataSource.query(
      `INSERT INTO property_owners
         (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [
        dto.property_id,
        ownerId,
        dto.ownership_percentage ?? 100,
        dto.is_primary ?? false,
      ],
    );

    return {
      message: `Propiedad "${propertyRows[0].title}" asignada correctamente`,
    };
  }

  async removeProperty(
    ownerId: number,
    propertyId: number,
  ): Promise<{ message: string }> {
    await this.findOne(ownerId);

    const relationRows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM property_owners WHERE rental_owner_id = $1 AND property_id = $2`,
      [ownerId, propertyId],
    );
    if (relationRows.length === 0) {
      throw new NotFoundException(
        'La propiedad no está asignada al propietario indicado',
      );
    }

    await this.dataSource.query(`DELETE FROM property_owners WHERE id = $1`, [
      relationRows[0].id,
    ]);

    return { message: 'Propiedad removida correctamente del propietario' };
  }

  /**
   * Liquidaciones del propietario leídas de la tabla dedicada `owner_statements`
   * (fuente única de verdad, gestionada por el módulo owner-statements). Antes se
   * agregaban pagos al vuelo, lo que podía no coincidir con las liquidaciones reales.
   */
  async getStatements(ownerId: number): Promise<OwnerStatementRow[]> {
    await this.findOne(ownerId); // garantiza existencia

    return this.dataSource.query<OwnerStatementRow[]>(
      `SELECT
         os.id,
         os.period_month,
         os.period_year,
         os.property_id,
         p.title AS property_title,
         os.gross_rent,
         os.maintenance_deduction,
         os.management_commission,
         os.net_amount,
         os.currency,
         os.status
       FROM owner_statements os
       LEFT JOIN properties p ON p.id = os.property_id
       WHERE os.rental_owner_id = $1
       ORDER BY os.period_year DESC, os.period_month DESC, p.title ASC`,
      [ownerId],
    );
  }

  async getContracts(ownerId: number): Promise<OwnerContractRow[]> {
    await this.findOne(ownerId);

    return this.dataSource.query<OwnerContractRow[]>(
      `SELECT
         c.id,
         c.contract_number,
         c.status,
         c.start_date,
         c.end_date,
         c.monthly_rent,
         c.currency,
         c.tenant_id,
         c.tenant_name,
         c.property_id,
         p.title AS property_title
       FROM property_owners po
       JOIN contracts c ON c.property_id = po.property_id
       JOIN properties p ON p.id = c.property_id
       WHERE po.rental_owner_id = $1
       ORDER BY c.created_at DESC`,
      [ownerId],
    );
  }

  // ─── Helpers de validación ────────────────────────────────────────────────

  private async assertEmailUnique(
    email: string,
    excludeId?: number,
  ): Promise<void> {
    const rows: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM rental_owners WHERE primary_email = $1 ${excludeId ? 'AND id != $2' : ''}`,
      excludeId ? [email, excludeId] : [email],
    );

    if (rows.length > 0) {
      throw new ConflictException(
        `Ya existe un propietario con el email "${email}"`,
      );
    }
  }

  private async assertNoActiveProperties(ownerId: number): Promise<void> {
    const placeholders = ACTIVE_PROPERTY_STATUSES.map(
      (_, i) => `$${i + 2}`,
    ).join(', ');

    const rows: unknown[] = await this.dataSource.query(
      `SELECT po.property_id
       FROM property_owners po
       JOIN properties p ON p.id = po.property_id
       WHERE po.rental_owner_id = $1
         AND p.status IN (${placeholders})`,
      [ownerId, ...ACTIVE_PROPERTY_STATUSES],
    );

    if (rows.length > 0) {
      throw new BadRequestException(
        'No se puede desactivar un propietario con propiedades activas asignadas',
      );
    }
  }

  /**
   * Asegura que el propietario tenga un usuario de portal (role = PROPIETARIO).
   * Si no existe, lo crea con una contraseña aleatoria que nunca se entrega: el
   * propietario define la suya mediante el enlace de invitación.
   * Devuelve true si se creó la cuenta, false si ya existía.
   */
  private async ensureOwnerUser(owner: RentalOwnerRow): Promise<boolean> {
    if (!owner.is_active) {
      throw new BadRequestException(
        'El propietario debe estar activo para tener acceso al portal.',
      );
    }

    const existingUser = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM "user" WHERE email = $1`,
      [owner.primary_email],
    );

    if (existingUser.length > 0) {
      return false;
    }

    // Contraseña aleatoria de relleno: el dueño la reemplaza vía el enlace.
    const placeholderPassword = randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(placeholderPassword, 10);

    await this.dataSource.query(
      `INSERT INTO "user" (email, password, name, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PROPIETARIO', true, NOW(), NOW())`,
      [owner.primary_email, hashedPassword, owner.name, owner.phone_number],
    );

    return true;
  }

  /**
   * Invita al propietario a su portal: asegura su cuenta y genera un enlace de
   * un solo uso para que defina su propia contraseña. El admin nunca ve ni
   * maneja la contraseña. En producción el enlace también se envía por correo.
   */
  async inviteOwner(
    ownerId: number,
    tenantSlug: string,
  ): Promise<{
    email: string;
    inviteUrl: string;
    expiresAt: Date;
    created: boolean;
  }> {
    const owner = await this.findOne(ownerId);
    const created = await this.ensureOwnerUser(owner);

    const { resetUrl, expiresAt } =
      await this.authService.createPasswordSetupLink(owner.primary_email);

    this.logger.log(
      `Invitación de PROPIETARIO generada: ${owner.primary_email} (tenant ${tenantSlug}, created=${created})`,
    );

    return {
      email: owner.primary_email,
      inviteUrl: resetUrl,
      expiresAt,
      created,
    };
  }

  private toSummary(row: RentalOwnerRow): RentalOwnerSummary {
    return {
      id: row.id,
      name: row.name,
      company_name: row.company_name,
      is_company: row.is_company,
      primary_email: row.primary_email,
      phone_number: row.phone_number,
      secondary_email: row.secondary_email,
      secondary_phone: row.secondary_phone,
      notes: row.notes,
      is_active: row.is_active,
      bank_name: row.bank_name,
      account_number: row.account_number,
      account_type: row.account_type,
      account_holder_name: row.account_holder_name,
      cbu_iban: row.cbu_iban,
      property_count: row.property_count ?? 0,
      pending_balance: Number(row.pending_balance ?? 0),
      has_account: row.has_account ?? false,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}

// ─── Interfaces de respuesta ─────────────────────────────────────────────────

export interface RentalOwnerRow {
  id: number;
  name: string;
  company_name: string;
  is_company: boolean;
  primary_email: string;
  phone_number: string;
  secondary_email: string;
  secondary_phone: string;
  notes: string;
  is_active: boolean;
  bank_name: string;
  account_number: string;
  account_type: string;
  account_holder_name: string;
  cbu_iban: string;
  property_count?: number;
  pending_balance?: string | number;
  has_account?: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface RentalOwnerSummary extends Omit<
  RentalOwnerRow,
  'pending_balance'
> {
  property_count: number;
  pending_balance: number;
  has_account: boolean;
}

export interface OwnerPropertyRow {
  relation_id: number;
  id: number;
  title: string;
  status: string;
  monthly_rent: string;
  currency: string;
  ownership_percentage: number;
  is_primary: boolean;
  street_address: string;
  city: string;
  country: string;
}

export interface OwnerStatementRow {
  id: number;
  period_month: number;
  period_year: number;
  property_id: number;
  property_title: string | null;
  gross_rent: string;
  maintenance_deduction: string;
  management_commission: string;
  net_amount: string;
  currency: string;
  status: string;
}

export interface OwnerContractRow {
  id: number;
  contract_number: string;
  status: string;
  start_date: string;
  end_date: string;
  monthly_rent: string;
  currency: string;
  tenant_id: number;
  tenant_name: string;
  property_id: number;
  property_title: string;
}
