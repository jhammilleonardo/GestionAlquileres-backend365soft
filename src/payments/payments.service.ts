import { Injectable, NotFoundException, BadRequestException, ForbiddenException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreatePaymentDto, CreatePaymentAsAdminDto, UpdatePaymentStatusDto, PaymentFiltersDto, CreateRefundDto } from './dto';
import { Payment, PaymentStats } from './interfaces/payment.interface';
import { PaymentStatus, PaymentProcessor } from './enums';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class PaymentsService {
  constructor(
    private dataSource: DataSource,
    private tenantsService: TenantsService,
  ) {}

  /**
   * ========================================
   * TENANT ENDPOINTS
   * ========================================
   */

  /**
   * Crear un nuevo pago (Tenant)
   */
  async createPayment(
    tenantId: number,
    dto: CreatePaymentDto,
    tenantSlug?: string,
    contractId?: number,
    propertyId?: number
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // CRITICAL: Establecer el schema correcto del tenant
      if (tenantSlug) {
        const tenant = await this.tenantsService.findBySlug(tenantSlug);
        await queryRunner.query(`SET search_path TO ${tenant.schema_name}`);
      }

      // Si no se proporciona contractId, obtener el contrato activo del tenant
      if (!contractId) {
        const contract = await queryRunner.query(
          `SELECT id, property_id FROM contracts
           WHERE tenant_id = $1 AND status IN ('ACTIVO', 'POR_VENCER')
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId]
        );

        if (!contract || contract.length === 0) {
          throw new BadRequestException('No tiene un contrato activo');
        }

        contractId = contract[0].id;
        propertyId = contract[0].property_id;
      }

      // Crear el pago
      const result = await queryRunner.query(
        `INSERT INTO payments (
          tenant_id, contract_id, property_id, amount, currency,
          payment_type, payment_method, status, payment_date, due_date,
          reference_number, check_number, notes, payment_processor,
          is_partial_payment, parent_payment_id, is_recurring,
          recurring_schedule_id, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, NOW(), NOW())
        RETURNING *`,
        [
          tenantId,
          contractId,
          propertyId,
          dto.amount,
          dto.currency || 'USD',
          dto.payment_type,
          dto.payment_method,
          PaymentStatus.PENDING,
          dto.payment_date,
          dto.due_date || null,
          dto.reference_number || null,
          dto.check_number || null,
          dto.notes || null,
          dto.payment_processor || PaymentProcessor.MANUAL,
          dto.is_partial_payment || false,
          dto.parent_payment_id || null,
          dto.is_recurring || false,
          dto.recurring_schedule_id || null,
          tenantId
        ]
      );

      await queryRunner.commitTransaction();
      return result[0];
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Obtener pagos del tenant
   */
  async getTenantPayments(tenantId: number, tenantSlug: string): Promise<Payment[]> {
    // Establecer el schema correcto del tenant
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);

    const payments = await this.dataSource.query(
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
      FROM payments p
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN contracts c ON p.contract_id = c.id
      WHERE p.tenant_id = $1
      ORDER BY p.created_at DESC`,
      [tenantId]
    );

    return payments;
  }

  /**
   * Obtener estadísticas del tenant
   */
  async getTenantStats(tenantId: number, tenantSlug: string): Promise<PaymentStats> {
    // Establecer el schema correcto del tenant
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    await this.dataSource.query(`SET search_path TO ${tenant.schema_name}`);

    const stats = await this.dataSource.query(
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
      FROM payments
      WHERE tenant_id = $1`,
      [tenantId]
    );

    return stats[0];
  }

  /**
   * ========================================
   * ADMIN ENDPOINTS
   * ========================================
   */

  /**
   * Obtener todos los pagos con filtros (Admin)
   */
  async getAllPayments(filters: PaymentFiltersDto): Promise<{
    payments: Payment[];
    total: number;
    page: number;
    limit: number;
  }> {
    let whereConditions: string[] = [];
    let params: any[] = [];
    let paramIndex = 1;

    // Construir WHERE clause dinámicamente
    if (filters.status) {
      whereConditions.push(`p.status = $${paramIndex++}`);
      params.push(filters.status);
    }

    if (filters.type) {
      whereConditions.push(`p.payment_type = $${paramIndex++}`);
      params.push(filters.type);
    }

    if (filters.method) {
      whereConditions.push(`p.payment_method = $${paramIndex++}`);
      params.push(filters.method);
    }

    if (filters.currency) {
      whereConditions.push(`p.currency = $${paramIndex++}`);
      params.push(filters.currency);
    }

    if (filters.tenant_id) {
      whereConditions.push(`p.tenant_id = $${paramIndex++}`);
      params.push(filters.tenant_id);
    }

    if (filters.property_id) {
      whereConditions.push(`p.property_id = $${paramIndex++}`);
      params.push(filters.property_id);
    }

    if (filters.contract_id) {
      whereConditions.push(`p.contract_id = $${paramIndex++}`);
      params.push(filters.contract_id);
    }

    if (filters.date_from) {
      whereConditions.push(`p.payment_date >= $${paramIndex++}`);
      params.push(filters.date_from);
    }

    if (filters.date_to) {
      whereConditions.push(`p.payment_date <= $${paramIndex++}`);
      params.push(filters.date_to);
    }

    const whereClause = whereConditions.length > 0
      ? 'WHERE ' + whereConditions.join(' AND ')
      : '';

    // Whitelist para sort field (defensa en profundidad contra SQL injection)
    const allowedSortFields = ['created_at', 'updated_at', 'payment_date', 'amount', 'status', 'tenant_id', 'property_id'];
    const sortField = filters.sort && allowedSortFields.includes(filters.sort)
      ? filters.sort
      : 'created_at';

    const sortOrder = filters.order === 'ASC' ? 'ASC' : 'DESC';

    // Query principal
    const payments = await this.dataSource.query(
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
      FROM payments p
      LEFT JOIN "user" t ON p.tenant_id = t.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN contracts c ON p.contract_id = c.id
      ${whereClause}
      ORDER BY p.${sortField} ${sortOrder}
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, filters.limit || 50, ((filters.page || 1) - 1) * (filters.limit || 50)]
    );

    // Contar total
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*)::int as total FROM payments p ${whereClause}`,
      params
    );

    return {
      payments,
      total: countResult[0].total,
      page: filters.page || 1,
      limit: filters.limit || 50
    };
  }

  /**
   * Obtener estadísticas generales (Admin)
   */
  async getAdminStats(): Promise<PaymentStats> {
    const stats = await this.dataSource.query(
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
      FROM payments`
    );

    return stats[0];
  }

  /**
   * Crear un pago como Admin
   * El admin puede crear pagos manualmente especificando tenant, contrato y propiedad
   */
  async createPaymentAsAdmin(
    dto: CreatePaymentAsAdminDto,
    adminId: number
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el contrato existe y pertenece al tenant
      const contract = await queryRunner.query(
        `SELECT id, tenant_id, property_id, status FROM contracts WHERE id = $1`,
        [dto.contract_id]
      );

      if (!contract || contract.length === 0) {
        throw new NotFoundException(`Contrato #${dto.contract_id} no encontrado`);
      }

      if (contract[0].tenant_id !== dto.tenant_id) {
        throw new BadRequestException('El contrato no pertenece al inquilino especificado');
      }

      if (contract[0].property_id !== dto.property_id) {
        throw new BadRequestException('El contrato no pertenece a la propiedad especificada');
      }

      // Construir metadata con campos específicos del método de pago
      const metadata: any = {};

      // Campos específicos por método de pago
      if (dto.card_last_4_digits) metadata.card_last_4_digits = dto.card_last_4_digits;
      if (dto.card_holder_name) metadata.card_holder_name = dto.card_holder_name;
      if (dto.card_expiry) metadata.card_expiry = dto.card_expiry;
      if (dto.bank_name) metadata.bank_name = dto.bank_name;
      if (dto.bank_account_last_4) metadata.bank_account_last_4 = dto.bank_account_last_4;
      if (dto.received_by) metadata.received_by = dto.received_by;

      // Crear el pago
      const result = await queryRunner.query(
        `INSERT INTO payments (
          tenant_id, contract_id, property_id, amount, currency,
          payment_type, payment_method, status, payment_date, due_date,
          reference_number, check_number, notes, admin_notes, payment_processor,
          is_partial_payment, parent_payment_id, is_recurring,
          recurring_schedule_id, created_by, approved_by,
          approved_at, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, NOW(), NOW())
        RETURNING *`,
        [
          dto.tenant_id,
          dto.contract_id,
          dto.property_id,
          dto.amount,
          dto.currency || 'USD',
          dto.payment_type,
          dto.payment_method,
          dto.status || PaymentStatus.PENDING,
          dto.payment_date,
          dto.due_date || null,
          dto.reference_number || null,
          dto.check_number || null,
          dto.notes || null,
          dto.admin_notes || null,
          dto.payment_processor || PaymentProcessor.MANUAL,
          dto.is_partial_payment || false,
          dto.parent_payment_id || null,
          dto.is_recurring || false,
          dto.recurring_schedule_id || null,
          adminId, // created_by
          dto.status === PaymentStatus.APPROVED ? adminId : null, // approved_by
          dto.status === PaymentStatus.APPROVED ? new Date() : null, // approved_at
          Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null // metadata
        ]
      );

      await queryRunner.commitTransaction();
      return result[0];
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Obtener un pago por ID
   */
  async getPaymentById(id: number, tenantId?: number): Promise<Payment> {
    const conditions = tenantId
      ? 'WHERE p.id = $1 AND p.tenant_id = $2'
      : 'WHERE p.id = $1';
    const params = tenantId ? [id, tenantId] : [id];

    const payments = await this.dataSource.query(
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
      FROM payments p
      LEFT JOIN "user" t ON p.tenant_id = t.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN contracts c ON p.contract_id = c.id
      ${conditions}`,
      params
    );

    if (!payments || payments.length === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }

    return payments[0];
  }

  /**
   * Actualizar estado de un pago (Admin)
   */
  async updatePaymentStatus(
    id: number,
    dto: UpdatePaymentStatusDto,
    adminId: number
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el pago existe
      const payment = await queryRunner.query(
        'SELECT * FROM payments WHERE id = $1',
        [id]
      );

      if (!payment || payment.length === 0) {
        throw new NotFoundException(`Pago #${id} no encontrado`);
      }

      // Actualizar el pago
      const updated = await queryRunner.query(
        `UPDATE payments
         SET status = $1,
             admin_notes = $2,
             rejection_reason = $3,
             approved_by = $4,
             approved_at = CASE WHEN $1 = 'APPROVED' THEN NOW() ELSE approved_at END,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          dto.status,
          dto.admin_notes || payment[0].admin_notes,
          dto.rejection_reason || payment[0].rejection_reason,
          adminId,
          id
        ]
      );

      await queryRunner.commitTransaction();
      return updated[0];
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Eliminar un pago (Admin)
   */
  async deletePayment(id: number): Promise<void> {
    const result = await this.dataSource.query(
      'DELETE FROM payments WHERE id = $1',
      [id]
    );

    if (result[1] === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }
  }

  /**
   * Crear un reembolso (Admin)
   */
  async createRefund(paymentId: number, dto: CreateRefundDto, adminId: number): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el pago existe y está aprobado
      const payment = await queryRunner.query(
        'SELECT * FROM payments WHERE id = $1 AND status = $2',
        [paymentId, PaymentStatus.APPROVED]
      );

      if (!payment || payment.length === 0) {
        throw new BadRequestException('El pago debe estar aprobado para reembolsarlo');
      }

      // Verificar que el monto del reembolso no exceda el pago
      if (dto.amount > payment[0].amount) {
        throw new BadRequestException('El monto del reembolso no puede exceder el monto del pago');
      }

      // Crear el reembolso
      await queryRunner.query(
        `INSERT INTO payment_refunds (
          payment_id, amount, reason, refund_method, refund_date,
          transaction_id, processed_by, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())`,
        [
          paymentId,
          dto.amount,
          dto.reason,
          dto.refund_method || null,
          dto.refund_date || new Date().toISOString().split('T')[0],
          dto.transaction_id || null,
          adminId
        ]
      );

      // Actualizar el estado del pago
      await queryRunner.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.REFUNDED, paymentId]
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }
}
