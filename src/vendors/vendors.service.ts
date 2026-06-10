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

const BCRYPT_SALT_ROUNDS = 10;

export interface VendorRow {
  id: number;
  name: string;
  specialty: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  rate_per_hour: string | null;
  rate_flat: string | null;
  is_active: boolean;
  average_rating: string | null;
  notes: string | null;
  created_by: number | null;
  created_at: Date;
  updated_at: Date;
  total_orders?: number | string | null;
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

@Injectable()
export class VendorsService {
  private readonly logger = new Logger(VendorsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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
      `SELECT v.* FROM vendors v ${where} ORDER BY v.average_rating DESC NULLS LAST, v.name ASC`,
      params,
    );
  }

  async findOne(id: number): Promise<VendorRow> {
    const rows: VendorRow[] = await this.dataSource.query(
      `SELECT v.*,
              COUNT(mr.id) FILTER (WHERE mr.vendor_id = v.id) AS total_orders,
              EXISTS (
                SELECT 1 FROM "user" u
                WHERE u.email = v.email AND u.role = 'VENDOR'
              ) AS has_account
         FROM vendors v
         LEFT JOIN maintenance_requests mr ON mr.vendor_id = v.id
         WHERE v.id = $1
         GROUP BY v.id`,
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
         (name, specialty, phone, email, address, rate_per_hour, rate_flat, is_active, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        dto.name,
        dto.specialty,
        dto.phone ?? null,
        dto.email ?? null,
        dto.address ?? null,
        dto.rate_per_hour ?? null,
        dto.rate_flat ?? null,
        dto.is_active ?? true,
        dto.notes ?? null,
        userId,
      ],
    );

    this.logger.log(`Vendor created: ${rows[0].id} (${rows[0].name})`);
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
    return rows[0];
  }

  async deactivate(id: number): Promise<{ message: string }> {
    await this.assertExists(id);

    await this.dataSource.query(
      `UPDATE vendors SET is_active = false, updated_at = now() WHERE id = $1`,
      [id],
    );

    this.logger.log(`Vendor deactivated: ${id}`);
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
   * Crea una cuenta de acceso (rol VENDOR) para el proveedor.
   * Genera una contraseña temporal y vincula el usuario por email.
   * Devuelve las credenciales para que el admin se las comparta una vez.
   */
  async createVendorAccount(
    vendorId: number,
  ): Promise<{ email: string; temporaryPassword: string }> {
    const vendor = await this.findOne(vendorId);

    if (!vendor.is_active) {
      throw new BadRequestException(
        'El proveedor debe estar activo para tener una cuenta.',
      );
    }

    if (!vendor.email) {
      throw new BadRequestException(
        'El proveedor necesita un correo para poder crear su cuenta de acceso.',
      );
    }

    const existingUser = await this.dataSource.query<
      { id: number; role: string }[]
    >(`SELECT id, role FROM "user" WHERE email = $1`, [vendor.email]);

    // Si el email ya pertenece a otro tipo de cuenta (admin, inquilino, etc.)
    // no la tocamos: es una colisión real que el admin debe resolver.
    if (existingUser.length > 0 && existingUser[0].role !== 'VENDOR') {
      throw new ConflictException(
        'Ya existe una cuenta de otro tipo con el email de este proveedor.',
      );
    }

    const temporaryPassword = randomBytes(5).toString('hex');
    const hashedPassword = await bcrypt.hash(
      temporaryPassword,
      BCRYPT_SALT_ROUNDS,
    );

    if (existingUser.length > 0) {
      // Ya tiene cuenta VENDOR: regeneramos su contraseña (reset).
      await this.dataSource.query(
        `UPDATE "user" SET password = $1, is_active = true, updated_at = NOW() WHERE id = $2`,
        [hashedPassword, existingUser[0].id],
      );
      this.logger.log(`Contraseña regenerada para proveedor ${vendorId}`);
    } else {
      await this.dataSource.query(
        `INSERT INTO "user" (email, password, name, phone, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'VENDOR', true, NOW(), NOW())`,
        [vendor.email, hashedPassword, vendor.name, vendor.phone],
      );
      this.logger.log(`Cuenta de VENDOR creada para proveedor ${vendorId}`);
    }

    return { email: vendor.email, temporaryPassword };
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
