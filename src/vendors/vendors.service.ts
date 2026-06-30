import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { randomBytes } from 'crypto';
import * as bcrypt from 'bcrypt';
import { CreateVendorDto, UpdateVendorDto, VendorFiltersDto } from './dto';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { AuthService } from '../auth/auth.service';
import { BCRYPT_SALT_ROUNDS as STRONG_BCRYPT_ROUNDS } from '../common/constants/security.constants';

const BCRYPT_SALT_ROUNDS = 10;

/** Vigencia del enlace de invitación al portal del proveedor: 48 horas. */
const VENDOR_INVITE_TTL_MS = 1000 * 60 * 60 * 48;

export interface VendorRow {
  id: number;
  name: string;
  specialty: string;
  specialty_other: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  tax_id: string | null;
  license_number: string | null;
  insurance_expires_at: Date | null;
  rate_per_hour: string | null;
  rate_flat: string | null;
  is_active: boolean;
  average_rating: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  total_orders?: number | string | null;
  open_orders?: number | string | null;
  completed_orders?: number | string | null;
  expenses_count?: number | string | null;
  pending_balance?: number | string | null;
  paid_total?: number | string | null;
  compliance_score?: number | string | null;
  has_account?: boolean;
}

export interface VendorHistoryRow {
  id: number;
  ticket_number: string;
  title: string;
  status: string;
  priority: string;
  current_stage: string;
  vendor_rating: number | null;
  vendor_rating_comment: string | null;
  vendor_rated_at: Date | null;
  created_at: Date;
  completed_at: Date | null;
}

/** Perfil que el propio proveedor ve en su portal (sin datos internos del admin). */
export interface VendorPortalProfile {
  id: number;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  specialty: string;
  specialty_other: string | null;
  tax_id: string | null;
  license_number: string | null;
  insurance_expires_at: Date | null;
  rate_per_hour: string | null;
  rate_flat: string | null;
  average_rating: string | null;
  compliance_score: number | string | null;
  total_orders: number | string | null;
  open_orders: number | string | null;
  completed_orders: number | string | null;
  pending_balance: number | string | null;
  paid_total: number | string | null;
}

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly auditLogsService: AuditLogsService,
    private readonly authService: AuthService,
  ) {}

  async findAll(filters: VendorFiltersDto): Promise<VendorRow[]> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const isActive = filters.is_active ?? true;
    conditions.push(`v.is_active = $${idx++}`);
    params.push(isActive);

    if (filters.specialty) {
      conditions.push(`v.specialty = $${idx++}`);
      params.push(filters.specialty);
    }

    if (filters.search) {
      conditions.push(`v.name ILIKE $${idx++}`);
      params.push(`%${filters.search}%`);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    return this.dataSource.query(
      `SELECT v.*,
              COALESCE(mr.total_orders, 0) AS total_orders,
              COALESCE(mr.open_orders, 0) AS open_orders,
              COALESCE(mr.completed_orders, 0) AS completed_orders,
              COALESCE(exp.expenses_count, 0) AS expenses_count,
              COALESCE(exp.pending_balance, 0) AS pending_balance,
              COALESCE(exp.paid_total, 0) AS paid_total,
              (
                (CASE WHEN v.email IS NOT NULL AND v.email <> '' THEN 25 ELSE 0 END) +
                (CASE WHEN v.phone IS NOT NULL AND v.phone <> '' THEN 20 ELSE 0 END) +
                (CASE WHEN v.tax_id IS NOT NULL AND v.tax_id <> '' THEN 20 ELSE 0 END) +
                (CASE WHEN v.license_number IS NOT NULL AND v.license_number <> '' THEN 15 ELSE 0 END) +
                (CASE
                  WHEN v.insurance_expires_at IS NOT NULL
                   AND v.insurance_expires_at::date >= CURRENT_DATE THEN 20
                  ELSE 0
                END)
              ) AS compliance_score,
              EXISTS (
                SELECT 1 FROM "user" u
                WHERE u.email = v.email AND u.role = 'VENDOR'
              ) AS has_account
         FROM vendors v
         LEFT JOIN (
           SELECT vendor_id,
                  COUNT(*) AS total_orders,
                  COUNT(*) FILTER (
                    WHERE status NOT IN ('COMPLETED', 'CLOSED')
                  ) AS open_orders,
                  COUNT(*) FILTER (
                    WHERE status IN ('COMPLETED', 'CLOSED')
                  ) AS completed_orders
             FROM maintenance_requests
            WHERE vendor_id IS NOT NULL
            GROUP BY vendor_id
         ) mr ON mr.vendor_id = v.id
         LEFT JOIN (
           SELECT vendor_id,
                  COUNT(*) AS expenses_count,
                  SUM(CASE
                    WHEN payment_status IN ('PENDING', 'PARTIALLY_PAID')
                    THEN GREATEST(amount - COALESCE(paid_amount, 0), 0)
                    ELSE 0
                  END) AS pending_balance,
                  SUM(COALESCE(paid_amount, 0)) AS paid_total
             FROM expenses
            WHERE vendor_id IS NOT NULL
            GROUP BY vendor_id
         ) exp ON exp.vendor_id = v.id
         ${where}
         ORDER BY COALESCE(exp.pending_balance, 0) DESC,
                  COALESCE(mr.open_orders, 0) DESC,
                  v.average_rating DESC NULLS LAST,
                  v.name ASC`,
      params,
    );
  }

  async findOne(id: number): Promise<VendorRow> {
    const rows: VendorRow[] = await this.dataSource.query(
      `SELECT v.*,
              COUNT(mr.id) FILTER (WHERE mr.vendor_id = v.id) AS total_orders,
              COUNT(mr.id) FILTER (
                WHERE mr.vendor_id = v.id
                  AND mr.status NOT IN ('COMPLETED', 'CLOSED')
              ) AS open_orders,
              COUNT(mr.id) FILTER (
                WHERE mr.vendor_id = v.id
                  AND mr.status IN ('COMPLETED', 'CLOSED')
              ) AS completed_orders,
              COALESCE(exp.expenses_count, 0) AS expenses_count,
              COALESCE(exp.pending_balance, 0) AS pending_balance,
              COALESCE(exp.paid_total, 0) AS paid_total,
              (
                (CASE WHEN v.email IS NOT NULL AND v.email <> '' THEN 25 ELSE 0 END) +
                (CASE WHEN v.phone IS NOT NULL AND v.phone <> '' THEN 20 ELSE 0 END) +
                (CASE WHEN v.tax_id IS NOT NULL AND v.tax_id <> '' THEN 20 ELSE 0 END) +
                (CASE WHEN v.license_number IS NOT NULL AND v.license_number <> '' THEN 15 ELSE 0 END) +
                (CASE
                  WHEN v.insurance_expires_at IS NOT NULL
                   AND v.insurance_expires_at::date >= CURRENT_DATE THEN 20
                  ELSE 0
                END)
              ) AS compliance_score,
              EXISTS (
                SELECT 1 FROM "user" u
                WHERE u.email = v.email AND u.role = 'VENDOR'
              ) AS has_account
         FROM vendors v
         LEFT JOIN maintenance_requests mr ON mr.vendor_id = v.id
         LEFT JOIN (
           SELECT vendor_id,
                  COUNT(*) AS expenses_count,
                  SUM(CASE
                    WHEN payment_status IN ('PENDING', 'PARTIALLY_PAID')
                    THEN GREATEST(amount - COALESCE(paid_amount, 0), 0)
                    ELSE 0
                  END) AS pending_balance,
                  SUM(COALESCE(paid_amount, 0)) AS paid_total
             FROM expenses
            WHERE vendor_id IS NOT NULL
            GROUP BY vendor_id
         ) exp ON exp.vendor_id = v.id
         WHERE v.id = $1
         GROUP BY v.id, exp.expenses_count, exp.pending_balance, exp.paid_total`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }

    return rows[0];
  }

  async create(dto: CreateVendorDto, userId: number): Promise<VendorRow> {
    const rows: VendorRow[] = await this.dataSource.query(
      `INSERT INTO vendors
         (name, specialty, specialty_other, phone, email, address, tax_id, license_number, insurance_expires_at, rate_per_hour, rate_flat, is_active, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       RETURNING *`,
      [
        dto.name,
        dto.specialty,
        dto.specialty === 'other' ? (dto.specialty_other ?? null) : null,
        dto.phone ?? null,
        dto.email ?? null,
        dto.address ?? null,
        dto.tax_id ?? null,
        dto.license_number ?? null,
        dto.insurance_expires_at ?? null,
        dto.rate_per_hour ?? null,
        dto.rate_flat ?? null,
        dto.is_active ?? true,
        dto.notes ?? null,
        userId,
      ],
    );

    this.logger.log(`Vendor created: ${rows[0].id} (${rows[0].name})`);
    await this.auditLogsService.log({
      userId,
      action: AuditAction.CREATED,
      entityType: 'vendor',
      entityId: rows[0].id,
      newValues: { name: dto.name, specialty: dto.specialty },
    });
    return rows[0];
  }

  async update(id: number, dto: UpdateVendorDto): Promise<VendorRow> {
    await this.assertExists(id);

    const fields: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    const fieldMap: Array<[keyof UpdateVendorDto, string]> = [
      ['name', 'name'],
      ['specialty', 'specialty'],
      ['phone', 'phone'],
      ['email', 'email'],
      ['address', 'address'],
      ['tax_id', 'tax_id'],
      ['license_number', 'license_number'],
      ['insurance_expires_at', 'insurance_expires_at'],
      ['rate_per_hour', 'rate_per_hour'],
      ['rate_flat', 'rate_flat'],
      ['is_active', 'is_active'],
      ['notes', 'notes'],
    ];

    for (const [dtoKey, dbCol] of fieldMap) {
      if (dto[dtoKey] !== undefined) {
        fields.push(`${dbCol} = $${idx++}`);
        params.push(dto[dtoKey]);
      }
    }

    // La especialidad libre solo aplica cuando specialty === 'other'; al cambiar
    // a otra especialidad se limpia para no dejar un nombre personalizado huérfano.
    if (dto.specialty !== undefined) {
      fields.push(`specialty_other = $${idx++}`);
      params.push(dto.specialty === 'other' ? (dto.specialty_other ?? null) : null);
    } else if (dto.specialty_other !== undefined) {
      fields.push(`specialty_other = $${idx++}`);
      params.push(dto.specialty_other);
    }

    if (fields.length === 0) {
      return this.findOne(id);
    }

    fields.push(`updated_at = now()`);
    params.push(id);

    const rows: VendorRow[] = await this.dataSource.query(
      `UPDATE vendors SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      params,
    );

    this.logger.log(`Vendor updated: ${id}`);
    await this.auditLogsService.log({
      action: AuditAction.UPDATED,
      entityType: 'vendor',
      entityId: id,
      newValues: { ...dto },
    });
    return rows[0];
  }

  async deactivate(id: number): Promise<{ message: string }> {
    await this.assertExists(id);

    await this.dataSource.query(
      `UPDATE vendors SET is_active = false, updated_at = now() WHERE id = $1`,
      [id],
    );

    this.logger.log(`Vendor deactivated: ${id}`);
    await this.auditLogsService.log({
      action: AuditAction.STATUS_CHANGED,
      entityType: 'vendor',
      entityId: id,
      newValues: { is_active: false },
    });
    return { message: `Proveedor ${id} desactivado correctamente` };
  }

  async getHistory(id: number): Promise<VendorHistoryRow[]> {
    await this.assertExists(id);

    return this.dataSource.query(
      `SELECT mr.id, mr.ticket_number, mr.title, mr.status, mr.priority,
              mr.current_stage, mr.vendor_rating, mr.vendor_rating_comment,
              mr.vendor_rated_at, mr.created_at, mr.completed_at
         FROM maintenance_requests mr
         WHERE mr.vendor_id = $1
         ORDER BY mr.created_at DESC`,
      [id],
    );
  }

  async recalculateAverageRating(vendorId: number): Promise<void> {
    await this.dataSource.query(
      `UPDATE vendors
         SET average_rating = (
           SELECT ROUND(AVG(vendor_rating)::numeric, 2)
           FROM maintenance_requests
           WHERE vendor_id = $1 AND vendor_rating IS NOT NULL
         ),
         updated_at = now()
         WHERE id = $1`,
      [vendorId],
    );
  }

  /**
   * Invita al proveedor a su portal: asegura su cuenta (rol VENDOR) y genera un
   * enlace de un solo uso para que defina su propia contraseña. El admin nunca
   * ve ni maneja la contraseña — solo comparte el enlace, que caduca en 48 h.
   * En producción el enlace también se envía por correo (si SendGrid está
   * configurado). Reusa el flujo seguro de tokens de `auth`.
   */
  async inviteVendor(vendorId: number): Promise<{
    email: string;
    inviteUrl: string;
    expiresAt: Date;
    created: boolean;
  }> {
    const vendor = await this.findOne(vendorId);

    if (!vendor.is_active) {
      throw new BadRequestException(
        'El proveedor debe estar activo para tener acceso al portal.',
      );
    }

    if (!vendor.email) {
      throw new BadRequestException(
        'El proveedor necesita un correo para poder invitarlo al portal.',
      );
    }

    const created = await this.ensureVendorUser(vendor);

    const { resetUrl, expiresAt } =
      await this.authService.createPasswordSetupLink(
        vendor.email,
        VENDOR_INVITE_TTL_MS,
      );

    this.logger.log(
      `Invitación de VENDOR generada para proveedor ${vendorId} (created=${created})`,
    );
    await this.auditLogsService.log({
      action: AuditAction.INVITED,
      entityType: 'vendor',
      entityId: vendorId,
      newValues: { email: vendor.email, expiresAt },
    });

    return { email: vendor.email, inviteUrl: resetUrl, expiresAt, created };
  }

  /**
   * Asegura que exista el usuario de portal (rol VENDOR) del proveedor.
   * Crea uno con contraseña aleatoria de relleno si no existe — el proveedor la
   * reemplaza vía el enlace de invitación. Devuelve `true` si lo creó.
   */
  private async ensureVendorUser(vendor: VendorRow): Promise<boolean> {
    const existingUser = await this.dataSource.query<
      { id: number; role: string }[]
    >(`SELECT id, role FROM "user" WHERE email = $1`, [vendor.email]);

    if (existingUser.length > 0) {
      // El email ya pertenece a otro tipo de cuenta: colisión real que el admin
      // debe resolver; nunca la convertimos en proveedor.
      if (existingUser[0].role !== 'VENDOR') {
        throw new ConflictException(
          'Ya existe una cuenta de otro tipo con el email de este proveedor.',
        );
      }
      return false;
    }

    const placeholderPassword = randomBytes(24).toString('hex');
    const hashedPassword = await bcrypt.hash(
      placeholderPassword,
      BCRYPT_SALT_ROUNDS,
    );

    await this.dataSource.query(
      `INSERT INTO "user" (email, password, name, phone, role, is_active, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'VENDOR', true, NOW(), NOW())`,
      [vendor.email, hashedPassword, vendor.name, vendor.phone],
    );
    this.logger.log(`Cuenta de VENDOR creada para proveedor ${vendor.id}`);
    return true;
  }

  /**
   * Perfil del proveedor para su propio portal. Reusa el cálculo de `findOne`
   * (rating, cumplimiento, finanzas) pero omite datos internos del admin como
   * las notas o quién lo creó.
   */
  async getPortalProfile(vendorId: number): Promise<VendorPortalProfile> {
    const v = await this.findOne(vendorId);
    return {
      id: v.id,
      name: v.name,
      email: v.email,
      phone: v.phone,
      address: v.address,
      specialty: v.specialty,
      specialty_other: v.specialty_other,
      tax_id: v.tax_id,
      license_number: v.license_number,
      insurance_expires_at: v.insurance_expires_at,
      rate_per_hour: v.rate_per_hour,
      rate_flat: v.rate_flat,
      average_rating: v.average_rating,
      compliance_score: v.compliance_score ?? null,
      total_orders: v.total_orders ?? null,
      open_orders: v.open_orders ?? null,
      completed_orders: v.completed_orders ?? null,
      pending_balance: v.pending_balance ?? null,
      paid_total: v.paid_total ?? null,
    };
  }

  /**
   * Cambio de contraseña autoservicio del proveedor desde su portal. Valida la
   * contraseña actual, exige que la nueva sea distinta y audita el cambio.
   */
  async changeVendorPassword(
    userId: number,
    currentPassword: string,
    newPassword: string,
  ): Promise<{ message: string }> {
    const rows = await this.dataSource.query<
      { id: number; password: string }[]
    >(`SELECT id, password FROM "user" WHERE id = $1 AND role = 'VENDOR'`, [
      userId,
    ]);

    if (rows.length === 0) {
      throw new NotFoundException('Cuenta de proveedor no encontrada');
    }

    const matchesCurrent = await bcrypt.compare(
      currentPassword,
      rows[0].password,
    );
    if (!matchesCurrent) {
      throw new BadRequestException('La contraseña actual no es correcta');
    }

    const sameAsOld = await bcrypt.compare(newPassword, rows[0].password);
    if (sameAsOld) {
      throw new BadRequestException(
        'La nueva contraseña debe ser diferente de la actual',
      );
    }

    const hashedPassword = await bcrypt.hash(newPassword, STRONG_BCRYPT_ROUNDS);
    await this.dataSource.query(
      `UPDATE "user" SET password = $1, updated_at = NOW() WHERE id = $2`,
      [hashedPassword, userId],
    );

    this.logger.log(`Proveedor (user ${userId}) cambió su contraseña`);
    await this.auditLogsService.log({
      userId,
      action: AuditAction.PASSWORD_CHANGED,
      entityType: 'user',
      entityId: userId,
    });

    return { message: 'Contraseña actualizada correctamente' };
  }

  private async assertExists(id: number): Promise<void> {
    const rows: unknown[] = await this.dataSource.query(
      `SELECT id FROM vendors WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Proveedor con ID ${id} no encontrado`);
    }
  }
}
