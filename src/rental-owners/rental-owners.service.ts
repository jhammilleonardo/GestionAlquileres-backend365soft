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

/** Estados de contrato que implican una propiedad "activa" para el propietario. */
const ACTIVE_PROPERTY_STATUSES = ['DISPONIBLE', 'OCUPADO', 'RESERVADO', 'MANTENIMIENTO'];

@Injectable()
export class RentalOwnersService {
  private readonly logger = new Logger(RentalOwnersService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
        ), 0)::numeric                            AS pending_balance
      FROM rental_owners ro
      LEFT JOIN property_owners po ON po.rental_owner_id = ro.id
      LEFT JOIN payments p
             ON p.property_id = po.property_id
      GROUP BY ro.id
      ORDER BY ro.name ASC
    `);

    return rows.map(this.toSummary);
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

  /**
   * Historial de pagos agrupado por mes para todas las propiedades del dueño.
   * Sirve como base del estado de cuenta hasta que se implemente
   * la tabla owner_statements dedicada (Fase 3).
   */
  async getStatements(ownerId: number): Promise<OwnerStatementRow[]> {
    await this.findOne(ownerId); // garantiza existencia

    return this.dataSource.query<OwnerStatementRow[]>(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', py.payment_date), 'YYYY-MM') AS period,
         p.id    AS property_id,
         p.title AS property_title,
         SUM(py.amount)                                           AS total_collected,
         py.currency,
         COUNT(py.id)::int                                        AS payment_count,
         SUM(py.amount) FILTER (WHERE py.status = 'CONFIRMED')   AS confirmed_amount,
         SUM(py.amount) FILTER (WHERE py.status = 'PENDING')     AS pending_amount
       FROM property_owners po
       JOIN properties p    ON p.id  = po.property_id
       JOIN payments   py   ON py.property_id = po.property_id
       WHERE po.rental_owner_id = $1
       GROUP BY DATE_TRUNC('month', py.payment_date), p.id, p.title, py.currency
       ORDER BY period DESC, p.title ASC`,
      [ownerId],
    );
  }

  // ─── Helpers de validación ────────────────────────────────────────────────

  private async assertEmailUnique(email: string, excludeId?: number): Promise<void> {
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
    const placeholders = ACTIVE_PROPERTY_STATUSES.map((_, i) => `$${i + 2}`).join(', ');

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
   * Crea una cuenta de usuario para el propietario.
   * Genera una contraseña aleatoria, crea el usuario con role = 'PROPIETARIO'
   * y devuelve las credenciales temporales al admin.
   */
  async createOwnerAccount(ownerId: number, tenantSlug: string): Promise<{ email: string; temporaryPassword: string }> {
    const owner = await this.findOne(ownerId);

    if (!owner.is_active) {
      throw new BadRequestException('El propietario debe estar activo para tener una cuenta.');
    }

    // Verificar si ya existe un usuario con su email
    const existingUser = await this.dataSource.query(
      `SELECT id FROM "user" WHERE email = $1`,
      [owner.primary_email],
    );

    if (existingUser.length > 0) {
      throw new ConflictException('Ya existe una cuenta de usuario con el email de este propietario.');
    }

    // Generar contraseña temporal
    const temporaryPassword = randomBytes(5).toString('hex');
    const saltRounds = 10;
    const hashedPassword = await bcrypt.hash(temporaryPassword, saltRounds);

    await this.dataSource.query(
      `INSERT INTO "user" (email, password, name, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'PROPIETARIO', true, NOW(), NOW())`,
      [
        owner.primary_email,
        hashedPassword,
        owner.name,
        owner.phone_number,
      ],
    );

    this.logger.log(`Cuenta de PROPIETARIO creada: ${owner.primary_email} (tenant ${tenantSlug})`);

    return {
      email: owner.primary_email,
      temporaryPassword,
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
  created_at: Date;
  updated_at: Date;
}

export interface RentalOwnerSummary extends Omit<RentalOwnerRow, 'pending_balance'> {
  property_count: number;
  pending_balance: number;
}

export interface OwnerPropertyRow {
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
  period: string;
  property_id: number;
  property_title: string;
  total_collected: string;
  currency: string;
  payment_count: number;
  confirmed_amount: string;
  pending_amount: string;
}
