import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  CreatePaymentDto,
  CreatePaymentAsAdminDto,
  UpdatePaymentStatusDto,
  PaymentFiltersDto,
  CreateRefundDto,
  ApprovePaymentDto,
  RejectPaymentDto,
} from './dto';
import { Payment, PaymentStats } from './interfaces/payment.interface';
import { PaymentStatus, PaymentProcessor, PaymentMethod, PaymentMethodLabels } from './enums';
import { TenantsService } from '../tenants/tenants.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { OwnerStatementsService } from '../owner-statements/owner-statements.service';

@Injectable()
export class PaymentsService {
  constructor(
    private dataSource: DataSource,
    private tenantsService: TenantsService,
    private notificationsService: NotificationsService,
    private ownerStatementsService: OwnerStatementsService,
  ) {}

  /**
   * ========================================
   * TENANT ENDPOINTS
   * ========================================
   */

  /**
   * Crear un nuevo pago (Tenant) con comprobante opcional.
   * receiptPath: ruta relativa del archivo subido (proof_file).
   */
  async createPayment(
    tenantId: number,
    dto: CreatePaymentDto,
    tenantSlug?: string,
    contractId?: number,
    propertyId?: number,
    receiptPath?: string,
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
          [tenantId],
        );

        if (!contract || contract.length === 0) {
          throw new BadRequestException('No tiene un contrato activo');
        }

        contractId = contract[0].id;
        propertyId = contract[0].property_id;
      }

      // Crear el pago (incluye proof_file si se subió comprobante)
      const result = await queryRunner.query(
        `INSERT INTO payments (
          tenant_id, contract_id, property_id, amount, currency,
          payment_type, payment_method, status, payment_date, due_date,
          reference_number, check_number, notes, payment_processor,
          proof_file,
          is_partial_payment, parent_payment_id, is_recurring,
          recurring_schedule_id, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, NOW(), NOW())
        RETURNING *`,
        [
          tenantId,
          contractId,
          propertyId,
          dto.amount,
          dto.currency || 'BOB',
          dto.payment_type,
          dto.payment_method,
          PaymentStatus.PENDING,
          dto.payment_date,
          dto.due_date || null,
          dto.reference_number || null,
          dto.check_number || null,
          dto.notes || null,
          dto.payment_processor || PaymentProcessor.MANUAL,
          receiptPath || null,
          dto.is_partial_payment || false,
          dto.parent_payment_id || null,
          dto.is_recurring || false,
          dto.recurring_schedule_id || null,
          tenantId,
        ],
      );

      await queryRunner.commitTransaction();

      // Notificar a los admins del nuevo pago pendiente de aprobación
      try {
        const tenant = await this.tenantsService.findBySlug(tenantSlug!);
        const admins = await this.dataSource.query(
          `SELECT id FROM ${tenant.schema_name}."user" WHERE role = 'ADMIN' AND is_active = true LIMIT 5`,
        );
        const adminIds = admins.map((a: { id: number }) => a.id);
        if (adminIds.length > 0) {
          const receiptNote = receiptPath ? ' con comprobante adjunto' : '';
          await this.notificationsService.notifyAdmins(
            adminIds,
            NotificationEventType.PAYMENT_CREATED,
            'Pago pendiente de aprobación',
            `Un inquilino registró un pago de ${dto.amount} ${dto.currency || 'BOB'}${receiptNote}. Requiere revisión.`,
            {
              payment_id: result[0].id,
              amount: dto.amount,
              currency: dto.currency || 'BOB',
              has_receipt: !!receiptPath,
            },
          );
        }
      } catch {
        // No propagar errores de notificación
      }

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
  async getTenantPayments(
    tenantId: number,
    tenantSlug: string,
  ): Promise<Payment[]> {
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
      [tenantId],
    );

    return payments;
  }

  /**
   * Obtener estadísticas del tenant
   */
  async getTenantStats(
    tenantId: number,
    tenantSlug: string,
  ): Promise<PaymentStats> {
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
      [tenantId],
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
    const whereConditions: string[] = [];
    const params: any[] = [];
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

    const whereClause =
      whereConditions.length > 0
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';

    // Whitelist para sort field (defensa en profundidad contra SQL injection)
    const allowedSortFields = [
      'created_at',
      'updated_at',
      'payment_date',
      'amount',
      'status',
      'tenant_id',
      'property_id',
    ];
    const sortField =
      filters.sort && allowedSortFields.includes(filters.sort)
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
      [
        ...params,
        filters.limit || 50,
        ((filters.page || 1) - 1) * (filters.limit || 50),
      ],
    );

    // Contar total
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*)::int as total FROM payments p ${whereClause}`,
      params,
    );

    return {
      payments,
      total: countResult[0].total,
      page: filters.page || 1,
      limit: filters.limit || 50,
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
      FROM payments`,
    );

    return stats[0];
  }

  /**
   * Crear un pago como Admin
   * El admin puede crear pagos manualmente especificando tenant, contrato y propiedad
   */
  async createPaymentAsAdmin(
    dto: CreatePaymentAsAdminDto,
    adminId: number,
    schemaName?: string,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Establecer el schema del tenant en esta conexión
      if (schemaName) {
        await queryRunner.query(`SET search_path TO ${schemaName}, public`);
      }

      // Verificar que el contrato existe y pertenece al tenant
      const contract = await queryRunner.query(
        `SELECT id, tenant_id, property_id, status FROM contracts WHERE id = $1`,
        [dto.contract_id],
      );

      if (!contract || contract.length === 0) {
        throw new NotFoundException(
          `Contrato #${dto.contract_id} no encontrado`,
        );
      }

      if (contract[0].tenant_id !== dto.tenant_id) {
        throw new BadRequestException(
          'El contrato no pertenece al inquilino especificado',
        );
      }

      if (contract[0].property_id !== dto.property_id) {
        throw new BadRequestException(
          'El contrato no pertenece a la propiedad especificada',
        );
      }

      // Construir metadata con campos específicos del método de pago
      const metadata: any = {};

      // Campos específicos por método de pago
      if (dto.card_last_4_digits)
        metadata.card_last_4_digits = dto.card_last_4_digits;
      if (dto.card_holder_name)
        metadata.card_holder_name = dto.card_holder_name;
      if (dto.card_expiry) metadata.card_expiry = dto.card_expiry;
      if (dto.bank_name) metadata.bank_name = dto.bank_name;
      if (dto.bank_account_last_4)
        metadata.bank_account_last_4 = dto.bank_account_last_4;
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
          Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null, // metadata
        ],
      );

      await queryRunner.commitTransaction();

      // Si el pago fue creado como APPROVED, notificar al tenant
      if (dto.status === PaymentStatus.APPROVED) {
        try {
          await this.notificationsService.createForUser(
            dto.tenant_id,
            NotificationEventType.PAYMENT_APPROVED,
            'Pago aprobado',
            `Tu pago de ${dto.amount} ${dto.currency || 'USD'} ha sido aprobado`,
            {
              payment_id: result[0].id,
              amount: dto.amount,
              currency: dto.currency || 'USD',
            },
          );
        } catch (notifError) {
          // No propagar errores de notificación
        }
      }

      return result[0];
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Exportar pagos como CSV (Admin)
   */
  async exportPaymentsCsv(filters: PaymentFiltersDto): Promise<string> {
    const whereConditions: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

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

    const whereClause =
      whereConditions.length > 0
        ? 'WHERE ' + whereConditions.join(' AND ')
        : '';

    const allowedSortFields = [
      'created_at',
      'updated_at',
      'payment_date',
      'amount',
      'status',
      'tenant_id',
      'property_id',
    ];
    const sortField =
      filters.sort && allowedSortFields.includes(filters.sort)
        ? filters.sort
        : 'created_at';
    const sortOrder = filters.order === 'ASC' ? 'ASC' : 'DESC';

    const payments = await this.dataSource.query(
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
      FROM payments p
      LEFT JOIN "user" t ON p.tenant_id = t.id
      LEFT JOIN properties prop ON p.property_id = prop.id
      LEFT JOIN contracts c ON p.contract_id = c.id
      ${whereClause}
      ORDER BY p.${sortField} ${sortOrder}`,
      params,
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

    const escape = (val: any) => {
      if (val === null || val === undefined) return '';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = payments.map((p: any) =>
      [
        escape(p.id),
        escape(p.amount),
        escape(p.currency),
        escape(p.payment_type),
        escape(p.payment_method),
        escape(p.status),
        escape(p.payment_date),
        escape(p.due_date),
        escape(p.reference_number),
        escape(p.notes),
        escape(p.created_at),
        escape(p.tenant_name),
        escape(p.tenant_email),
        escape(p.property_title),
        escape(p.contract_number),
      ].join(','),
    );

    return [headers.join(','), ...rows].join('\n');
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
      params,
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
    adminId: number,
    schemaName?: string,
  ): Promise<Payment> {
    // Usar nombre de tabla calificado para evitar depender de search_path
    const schema = schemaName || 'public';
    const table = `${schema}.payments`;

    try {
      // Verificar que el pago existe
      const payment = await this.dataSource.query(
        `SELECT * FROM ${table} WHERE id = $1`,
        [id],
      );

      if (!payment || payment.length === 0) {
        throw new NotFoundException(`Pago #${id} no encontrado`);
      }

      // Actualizar el pago ($6 es boolean para evitar conflicto de tipos en $1)
      const isApproved = dto.status === 'APPROVED';
      const updated = await this.dataSource.query(
        `UPDATE ${table}
         SET status = $1,
             admin_notes = $2,
             rejection_reason = $3,
             approved_by = $4,
             approved_at = CASE WHEN $6 THEN NOW() ELSE approved_at END,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          dto.status,
          dto.admin_notes || payment[0].admin_notes,
          dto.rejection_reason || payment[0].rejection_reason,
          adminId,
          id,
          isApproved,
        ],
      );

      // Notificar al tenant según el nuevo estado
      try {
        const tenantId: number = payment[0].tenant_id;
        const amount: number = payment[0].amount;
        const currency: string = payment[0].currency;
        if (dto.status === 'APPROVED') {
          await this.notificationsService.createForUser(
            tenantId,
            NotificationEventType.PAYMENT_APPROVED,
            'Pago aprobado',
            `Tu pago de ${amount} ${currency} ha sido aprobado`,
            { payment_id: id, amount, currency },
          );
        } else if (dto.status === 'REJECTED') {
          await this.notificationsService.createForUser(
            tenantId,
            NotificationEventType.PAYMENT_REJECTED,
            'Pago rechazado',
            `Tu pago de ${amount} ${currency} ha sido rechazado`,
            {
              payment_id: id,
              amount,
              currency,
              rejection_reason: dto.rejection_reason || '',
            },
          );
        }
      } catch (notifError) {
        // No propagar errores de notificación
      }

      return updated[0];
    } catch (error) {
      console.error('[updatePaymentStatus] Error:', error?.message || error);
      throw error;
    }
  }

  /**
   * Eliminar un pago (Admin)
   */
  async deletePayment(id: number, schemaName?: string): Promise<void> {
    if (schemaName) {
      await this.dataSource.query(`SET search_path TO ${schemaName}, public`);
    }
    const result = await this.dataSource.query(
      'DELETE FROM payments WHERE id = $1',
      [id],
    );

    if (result[1] === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }
  }

  // ==========================================
  // LÓGICA DE NEGOCIO — independiente del procesador
  // ==========================================

  /**
   * Calcula el cargo por mora.
   *
   * @param monthlyRent   Monto base del alquiler
   * @param daysLate      Días transcurridos desde el vencimiento
   * @param lateFeePct    Porcentaje de mora configurado en tenant_config (ej: 2 para 2%)
   * @param graceDays     Días de gracia antes de aplicar mora (default 0)
   * @returns Monto de mora a cobrar (0 si está dentro del período de gracia)
   */
  calculateLateFee(
    monthlyRent: number,
    daysLate: number,
    lateFeePct: number,
    graceDays = 0,
  ): number {
    if (daysLate <= graceDays) return 0;
    const fee = (monthlyRent * lateFeePct) / 100;
    return Math.round(fee * 100) / 100; // redondeo a 2 decimales
  }

  /**
   * Aplica un descuento porcentual al monto.
   *
   * @param amount       Monto base
   * @param discountPct  Porcentaje de descuento (0–100)
   * @returns Monto final tras aplicar el descuento
   */
  applyDiscount(amount: number, discountPct: number): number {
    if (discountPct <= 0) return amount;
    if (discountPct >= 100) return 0;
    const discounted = amount * (1 - discountPct / 100);
    return Math.round(discounted * 100) / 100;
  }

  /**
   * Valida si una transición de estado de pago es permitida.
   *
   * Transiciones válidas:
   *   PENDING     → PROCESSING | APPROVED | REJECTED | FAILED
   *   PROCESSING  → APPROVED | FAILED
   *   APPROVED    → REFUNDED | REVERSED | DISPUTED
   *   REJECTED    → (estado terminal)
   *   FAILED      → (estado terminal)
   *   REFUNDED    → (estado terminal)
   *   REVERSED    → (estado terminal)
   *   DISPUTED    → APPROVED | REVERSED
   */
  isValidStatusTransition(from: string, to: string): boolean {
    const allowed: Record<string, string[]> = {
      PENDING:    ['PROCESSING', 'APPROVED', 'REJECTED', 'FAILED'],
      PROCESSING: ['APPROVED', 'FAILED'],
      APPROVED:   ['REFUNDED', 'REVERSED', 'DISPUTED'],
      DISPUTED:   ['APPROVED', 'REVERSED'],
      REJECTED:   [],
      FAILED:     [],
      REFUNDED:   [],
      REVERSED:   [],
    };
    return (allowed[from] ?? []).includes(to);
  }

  /**
   * Aprobar un pago (Admin)
   * Cambia el estado a APPROVED, notifica al inquilino y dispara el split payment.
   */
  async approvePayment(
    id: number,
    dto: ApprovePaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    const schema = schemaName;
    const table = `${schema}.payments`;

    const rows = await this.dataSource.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id],
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }
    const payment = rows[0];

    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.PROCESSING) {
      throw new BadRequestException(
        `Solo se pueden aprobar pagos en estado PENDING o PROCESSING. Estado actual: ${payment.status}`,
      );
    }

    const updated = await this.dataSource.query(
      `UPDATE ${table}
       SET status      = $1,
           admin_notes = COALESCE($2, admin_notes),
           approved_by = $3,
           approved_at = NOW(),
           updated_at  = NOW()
       WHERE id = $4
       RETURNING *`,
      [PaymentStatus.APPROVED, dto.admin_notes || null, adminId, id],
    );

    // Notificar al inquilino
    try {
      await this.notificationsService.createForUser(
        payment.tenant_id as number,
        NotificationEventType.PAYMENT_APPROVED,
        'Pago aprobado',
        `Tu pago de ${payment.amount} ${payment.currency} ha sido aprobado`,
        { payment_id: id, amount: payment.amount, currency: payment.currency },
      );
    } catch {
      // No propagar errores de notificación
    }

    // Disparar cálculo de split payment
    await this.triggerSplitPayment(
      id,
      Number(payment.amount),
      payment.property_id as number,
      schema,
    );

    // Disparar creación de owner statements
    await this.triggerOwnerStatements(
      id,
      Number(payment.amount),
      payment.property_id as number,
      schema,
    );

    return updated[0];
  }

  /**
   * Rechazar un pago (Admin)
   * El motivo de rechazo es obligatorio y queda visible para el inquilino.
   */
  async rejectPayment(
    id: number,
    dto: RejectPaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    const schema = schemaName;
    const table = `${schema}.payments`;

    const rows = await this.dataSource.query(
      `SELECT * FROM ${table} WHERE id = $1`,
      [id],
    );
    if (!rows || rows.length === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }
    const payment = rows[0];

    if (payment.status !== PaymentStatus.PENDING && payment.status !== PaymentStatus.PROCESSING) {
      throw new BadRequestException(
        `Solo se pueden rechazar pagos en estado PENDING o PROCESSING. Estado actual: ${payment.status}`,
      );
    }

    const updated = await this.dataSource.query(
      `UPDATE ${table}
       SET status           = $1,
           rejection_reason = $2,
           admin_notes      = COALESCE($3, admin_notes),
           approved_by      = $4,
           updated_at       = NOW()
       WHERE id = $5
       RETURNING *`,
      [PaymentStatus.REJECTED, dto.rejection_reason, dto.admin_notes || null, adminId, id],
    );

    // Notificar al inquilino con el motivo
    try {
      await this.notificationsService.createForUser(
        payment.tenant_id as number,
        NotificationEventType.PAYMENT_REJECTED,
        'Pago rechazado',
        `Tu pago de ${payment.amount} ${payment.currency} fue rechazado: ${dto.rejection_reason}`,
        {
          payment_id: id,
          amount: payment.amount,
          currency: payment.currency,
          rejection_reason: dto.rejection_reason,
        },
      );
    } catch {
      // No propagar errores de notificación
    }

    return updated[0];
  }

  /**
   * Retorna los métodos de pago disponibles para el tenant según su configuración.
   * El frontend usa esto para construir el formulario de pago.
   */
  async getAvailablePaymentMethods(
    tenantSlug: string,
  ): Promise<{ method: string; label: string }[]> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    const config = await this.dataSource.query(
      `SELECT payment_methods FROM ${tenant.schema_name}.tenant_config LIMIT 1`,
    );

    if (!config || config.length === 0 || !config[0].payment_methods) {
      // Sin configuración: devolver todos los métodos disponibles
      return Object.values(PaymentMethod).map((m) => ({
        method: m,
        label: PaymentMethodLabels[m],
      }));
    }

    const configured: string[] = Array.isArray(config[0].payment_methods)
      ? config[0].payment_methods
      : JSON.parse(config[0].payment_methods);

    // Filtrar los métodos configurados que existen en el enum
    const validMethods = Object.values(PaymentMethod);
    return configured
      .filter((m) => validMethods.includes(m as PaymentMethod))
      .map((m) => ({
        method: m,
        label: PaymentMethodLabels[m as PaymentMethod],
      }));
  }

  /**
   * Calcula y persiste el split payment entre los propietarios de la propiedad.
   * Se llama automáticamente al aprobar un pago.
   * Si la propiedad no tiene propietarios registrados, no hace nada.
   */
  private async triggerSplitPayment(
    paymentId: number,
    amount: number,
    propertyId: number,
    schemaName: string,
  ): Promise<void> {
    try {
      const owners = await this.dataSource.query(
        `SELECT po.rental_owner_id, po.ownership_percentage, ro.name AS owner_name
         FROM ${schemaName}.property_owners po
         JOIN ${schemaName}.rental_owners ro ON ro.id = po.rental_owner_id
         WHERE po.property_id = $1
           AND po.ownership_percentage > 0`,
        [propertyId],
      );

      if (!owners || owners.length === 0) return;

      for (const owner of owners) {
        const splitAmount = Number(
          ((amount * owner.ownership_percentage) / 100).toFixed(2),
        );
        await this.dataSource.query(
          `INSERT INTO ${schemaName}.payment_splits
             (payment_id, rental_owner_id, owner_name, ownership_pct, amount)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            paymentId,
            owner.rental_owner_id,
            owner.owner_name,
            owner.ownership_percentage,
            splitAmount,
          ],
        );
      }
    } catch {
      // El split es no-crítico: si falla, no afecta la aprobación del pago
    }
  }

  /**
   * Crear estados de cuenta para los propietarios (owner statements)
   * Se dispara automáticamente al aprobar un pago
   */
  private async triggerOwnerStatements(
    paymentId: number,
    amount: number,
    propertyId: number,
    schemaName: string,
  ): Promise<void> {
    try {
      // Obtener el pago para saber la fecha
      const payment = await this.dataSource.query(
        `SELECT * FROM ${schemaName}.payments WHERE id = $1`,
        [paymentId],
      );

      if (!payment || payment.length === 0) return;

      const paymentDate = new Date(payment[0].payment_date);
      const year = paymentDate.getFullYear();
      const month = paymentDate.getMonth() + 1; // getMonth() retorna 0-11

      // Obtener propietarios de la propiedad
      const owners = await this.dataSource.query(
        `SELECT po.rental_owner_id, ro.name AS owner_name, po.ownership_percentage
         FROM ${schemaName}.property_owners po
         JOIN ${schemaName}.rental_owners ro ON ro.id = po.rental_owner_id
         WHERE po.property_id = $1
           AND po.ownership_percentage > 0`,
        [propertyId],
      );

      if (!owners || owners.length === 0) return;

      // Obtener configuración del tenant para commission_percentage
      const config = await this.dataSource.query(
        `SELECT commission_percentage FROM tenant_config LIMIT 1`,
      );

      const commissionPercentage = config && config.length > 0 ? config[0].commission_percentage || 15 : 15;

      // Obtener el currency del pago
      const currency = payment[0].currency || 'BOB';

      // Crear o actualizar statement para cada propietario
      for (const owner of owners) {
        const ownerShare = (amount * owner.ownership_percentage) / 100;

        try {
          await this.ownerStatementsService.createStatementFromPayment({
            month,
            year,
            rentalOwnerId: owner.rental_owner_id,
            propertyId,
            grossRent: ownerShare,
            maintenanceDeduction: 0, // TODO: Obtener deducción real cuando se implemente
            commissionPercentage,
            currency,
            paymentCount: 1,
          });
        } catch (error) {
          // Logear pero no fallar - owner statements es no-crítico
          console.warn(
            `No se pudo crear statement para propietario ${owner.rental_owner_id}:`,
            error,
          );
        }
      }
    } catch (error) {
      // Los owner statements son no-críticos: si falla, no afecta la aprobación del pago
      console.warn('Error al crear owner statements:', error);
    }
  }

  /**
   * Crear un reembolso (Admin)
   */
  async createRefund(
    paymentId: number,
    dto: CreateRefundDto,
    adminId: number,
  ): Promise<void> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Verificar que el pago existe y está aprobado
      const payment = await queryRunner.query(
        'SELECT * FROM payments WHERE id = $1 AND status = $2',
        [paymentId, PaymentStatus.APPROVED],
      );

      if (!payment || payment.length === 0) {
        throw new BadRequestException(
          'El pago debe estar aprobado para reembolsarlo',
        );
      }

      // Verificar que el monto del reembolso no exceda el pago
      if (dto.amount > payment[0].amount) {
        throw new BadRequestException(
          'El monto del reembolso no puede exceder el monto del pago',
        );
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
          adminId,
        ],
      );

      // Actualizar el estado del pago
      await queryRunner.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.REFUNDED, paymentId],
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
