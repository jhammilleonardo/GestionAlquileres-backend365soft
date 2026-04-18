import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  CreateOwnerStatementDto,
  UpdateOwnerStatementDto,
  OwnerStatementResponseDto,
} from './dto';
import { OwnerStatementPdfService } from './owner-statement-pdf.service';

interface OwnerStatementRow {
  id: number;
  rental_owner_id: number;
  property_id: number;
  unit_id: number | null;
  period_month: number;
  period_year: number;
  gross_rent: string;
  maintenance_deduction: string;
  management_commission: string;
  net_amount: string;
  currency: string;
  payment_count: number;
  status: 'pending' | 'transferred';
  transferred_at: Date | null;
  generated_at: Date;
  created_at: Date;
  updated_at: Date;
}

@Injectable()
export class OwnerStatementsService {
  private readonly logger = new Logger(OwnerStatementsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly pdfService: OwnerStatementPdfService,
  ) {}

  /**
   * Crear un nuevo estado de cuenta (statement)
   */
  async create(dto: CreateOwnerStatementDto): Promise<OwnerStatementResponseDto> {
    const query = `
      INSERT INTO owner_statements (
        rental_owner_id, property_id, period_month, period_year,
        gross_rent, maintenance_deduction, management_commission, net_amount,
        currency, payment_count, created_at, updated_at, generated_at
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW(), NOW())
      RETURNING *
    `;

    const values = [
      dto.rental_owner_id,
      dto.property_id,
      dto.period_month,
      dto.period_year,
      dto.gross_rent,
      dto.maintenance_deduction || 0,
      dto.management_commission,
      dto.net_amount,
      dto.currency || 'BOB',
      dto.payment_count || 0,
    ];

    try {
      const result = await this.dataSource.query<OwnerStatementRow[]>(query, values);
      return this.toDto(result[0]);
    } catch (error) {
      if (error.code === '23505') {
        // Unique constraint violation
        throw new BadRequestException(
          `Ya existe un estado de cuenta para este propietario, propiedad y período`,
        );
      }
      throw error;
    }
  }

  /**
   * Obtener un estado de cuenta por ID
   */
  async findOne(id: number): Promise<OwnerStatementResponseDto> {
    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `SELECT * FROM owner_statements WHERE id = $1`,
      [id],
    );

    if (!result || result.length === 0) {
      throw new NotFoundException(`Estado de cuenta con ID ${id} no encontrado`);
    }

    return this.toDto(result[0]);
  }

  /**
   * Obtener todos los estados de cuenta de un propietario
   */
  async findByOwner(rentalOwnerId: number): Promise<OwnerStatementResponseDto[]> {
    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `SELECT * FROM owner_statements
       WHERE rental_owner_id = $1
       ORDER BY period_year DESC, period_month DESC`,
      [rentalOwnerId],
    );

    return result.map((row) => this.toDto(row));
  }

  /**
   * Obtener estados de cuenta por período
   */
  async findByPeriod(
    year: number,
    month: number,
  ): Promise<OwnerStatementResponseDto[]> {
    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `SELECT * FROM owner_statements
       WHERE period_year = $1 AND period_month = $2
       ORDER BY rental_owner_id ASC`,
      [year, month],
    );

    return result.map((row) => this.toDto(row));
  }

  /**
   * Actualizar un estado de cuenta
   */
  async update(
    id: number,
    dto: UpdateOwnerStatementDto,
  ): Promise<OwnerStatementResponseDto> {
    const statement = await this.findOne(id);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.gross_rent !== undefined) {
      fields.push(`gross_rent = $${idx++}`);
      values.push(dto.gross_rent);
    }
    if (dto.maintenance_deduction !== undefined) {
      fields.push(`maintenance_deduction = $${idx++}`);
      values.push(dto.maintenance_deduction);
    }
    if (dto.management_commission !== undefined) {
      fields.push(`management_commission = $${idx++}`);
      values.push(dto.management_commission);
    }
    if (dto.net_amount !== undefined) {
      fields.push(`net_amount = $${idx++}`);
      values.push(dto.net_amount);
    }
    if (dto.currency !== undefined) {
      fields.push(`currency = $${idx++}`);
      values.push(dto.currency);
    }
    if (dto.payment_count !== undefined) {
      fields.push(`payment_count = $${idx++}`);
      values.push(dto.payment_count);
    }

    if (fields.length === 0) {
      return statement;
    }

    fields.push(`updated_at = NOW()`);
    values.push(id);

    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `UPDATE owner_statements SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    return this.toDto(result[0]);
  }

  /**
   * Eliminar un estado de cuenta
   */
  async delete(id: number): Promise<{ message: string }> {
    const statement = await this.findOne(id);

    await this.dataSource.query(`DELETE FROM owner_statements WHERE id = $1`, [id]);

    this.logger.log(`Estado de cuenta ${id} eliminado`);

    return { message: `Estado de cuenta ${id} eliminado correctamente` };
  }

  /**
   * Generar PDF para un estado de cuenta
   * Este método recupera toda la información necesaria de las tablas relacionadas
   */
  async generatePdf(id: number, language: 'es' | 'en' = 'es'): Promise<string> {
    const statement = await this.findOne(id);

    const query = `
      SELECT
        os.id,
        ro.name AS owner_name,
        p.title AS property_title,
        pa.street_address AS property_address,
        pa.city AS property_city,
        pa.country AS property_country,
        u.name AS tenant_name,
        os.period_year,
        os.period_month,
        os.gross_rent,
        os.maintenance_deduction,
        os.management_commission,
        os.net_amount,
        os.currency
      FROM owner_statements os
      JOIN rental_owners ro ON ro.id = os.rental_owner_id
      JOIN properties p ON p.id = os.property_id
      LEFT JOIN property_addresses pa
        ON pa.property_id = p.id AND pa.address_type = 'address_1'
      LEFT JOIN contracts c
        ON c.property_id = p.id AND c.status = 'ACTIVE'
      LEFT JOIN "user" u ON u.id = c.tenant_id
      WHERE os.id = $1
    `;

    const result = await this.dataSource.query(query, [id]);

    if (!result || result.length === 0) {
      throw new NotFoundException(
        `No se encontraron datos para generar el PDF del estado ${id}`,
      );
    }

    const data = result[0];

    // Generar PDF
    const filePath = await this.pdfService.generatePdf(
      {
        id: data.id,
        owner_name: data.owner_name,
        property_title: data.property_title,
        property_address: data.property_address || 'No especificada',
        property_city: data.property_city || '',
        property_country: data.property_country || '',
        tenant_name: data.tenant_name || undefined,
        period_year: data.period_year,
        period_month: data.period_month,
        gross_rent: Number(data.gross_rent),
        maintenance_deduction: Number(data.maintenance_deduction),
        management_commission: Number(data.management_commission),
        net_amount: Number(data.net_amount),
        currency: data.currency,
      },
      language,
    );

    return filePath;
  }

  /**
   * Crear automaticamente un statement cuando se confirma un pago
   * Se llama desde el servicio de pagos cuando se aprueba un pago
   */
  async createStatementFromPayment(
    paymentData: {
      month: number;
      year: number;
      rentalOwnerId: number;
      propertyId: number;
      grossRent: number;
      maintenanceDeduction: number;
      commissionPercentage: number;
      currency: string;
      paymentCount: number;
    }
  ): Promise<OwnerStatementResponseDto> {
    const managementCommission = (paymentData.grossRent * paymentData.commissionPercentage) / 100;
    const netAmount = paymentData.grossRent - paymentData.maintenanceDeduction - managementCommission;

    const dto: CreateOwnerStatementDto = {
      rental_owner_id: paymentData.rentalOwnerId,
      property_id: paymentData.propertyId,
      period_month: paymentData.month,
      period_year: paymentData.year,
      gross_rent: paymentData.grossRent,
      maintenance_deduction: paymentData.maintenanceDeduction,
      management_commission: managementCommission,
      net_amount: netAmount,
      currency: paymentData.currency,
      payment_count: paymentData.paymentCount,
    };

    // Si ya existe, actualizar en lugar de crear
    try {
      return await this.create(dto);
    } catch (error) {
      if (error instanceof BadRequestException) {
        // Statement ya existe, actualizarlo
        const existing = await this.findByOwnerPropertyPeriod(
          paymentData.rentalOwnerId,
          paymentData.propertyId,
          paymentData.year,
          paymentData.month,
        );
        return await this.update(existing.id, dto);
      }
      throw error;
    }
  }

  /**
   * Buscar un statement por propietario, propiedad y período
   */
  private async findByOwnerPropertyPeriod(
    rentalOwnerId: number,
    propertyId: number,
    year: number,
    month: number,
  ): Promise<OwnerStatementResponseDto> {
    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `SELECT * FROM owner_statements
       WHERE rental_owner_id = $1 AND property_id = $2 
         AND period_year = $3 AND period_month = $4`,
      [rentalOwnerId, propertyId, year, month],
    );

    if (!result || result.length === 0) {
      throw new NotFoundException(
        `No existe estado de cuenta para propietario ${rentalOwnerId}, propiedad ${propertyId}, período ${month}/${year}`,
      );
    }

    return this.toDto(result[0]);
  }

  /**
   * Marcar un estado de cuenta como transferido manualmente.
   * Registra la fecha exacta de transferencia.
   */
  async markTransferred(id: number): Promise<OwnerStatementResponseDto> {
    await this.findOne(id); // lanza NotFoundException si no existe

    const result = await this.dataSource.query<OwnerStatementRow[]>(
      `UPDATE owner_statements
       SET status = 'transferred', transferred_at = NOW(), updated_at = NOW()
       WHERE id = $1
       RETURNING *`,
      [id],
    );

    this.logger.log(`Estado de cuenta #${id} marcado como transferido`);
    return this.toDto(result[0]);
  }

  private toDto(row: OwnerStatementRow): OwnerStatementResponseDto {
    return {
      id: row.id,
      rental_owner_id: row.rental_owner_id,
      property_id: row.property_id,
      unit_id: row.unit_id,
      period_month: row.period_month,
      period_year: row.period_year,
      gross_rent: Number(row.gross_rent),
      maintenance_deduction: Number(row.maintenance_deduction),
      management_commission: Number(row.management_commission),
      net_amount: Number(row.net_amount),
      currency: row.currency,
      payment_count: row.payment_count,
      status: row.status,
      transferred_at: row.transferred_at,
      generated_at: row.generated_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }
}
