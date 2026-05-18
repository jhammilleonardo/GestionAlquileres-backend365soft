import {
  Injectable,
  BadRequestException,
  NotFoundException,
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
import { PaymentStatus } from './enums';
import { quoteIdent } from '../common/utils/sql-identifier';
import { WebhookResult } from './processors/payment-processor.interface';
import { PaymentQueriesService } from './payment-queries.service';
import {
  isValidPaymentStatusTransition,
  PaymentStatusService,
} from './payment-status.service';
import { PaymentRefundsService } from './payment-refunds.service';
import { PaymentWebhookService } from './payment-webhook.service';
import { PaymentCreationService } from './payment-creation.service';
import { PaymentMethodsService } from './payment-methods.service';

@Injectable()
export class PaymentsService {
  constructor(
    private dataSource: DataSource,
    private paymentQueriesService: PaymentQueriesService,
    private paymentStatusService: PaymentStatusService,
    private paymentRefundsService: PaymentRefundsService,
    private paymentWebhookService: PaymentWebhookService,
    private paymentCreationService: PaymentCreationService,
    private paymentMethodsService: PaymentMethodsService,
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
    return this.paymentCreationService.createPayment(
      tenantId,
      dto,
      tenantSlug,
      contractId,
      propertyId,
      receiptPath,
    );
  }

  /**
   * Obtener pagos del tenant
   */
  async getTenantPayments(
    tenantId: number,
    tenantSlug: string,
  ): Promise<Payment[]> {
    return this.paymentQueriesService.getTenantPayments(tenantId, tenantSlug);
  }

  /**
   * Obtener estadísticas del tenant
   */
  async getTenantStats(
    tenantId: number,
    tenantSlug: string,
  ): Promise<PaymentStats> {
    return this.paymentQueriesService.getTenantStats(tenantId, tenantSlug);
  }

  /**
   * ========================================
   * ADMIN ENDPOINTS
   * ========================================
   */

  /**
   * Obtener todos los pagos con filtros (Admin)
   */
  async getAllPayments(
    filters: PaymentFiltersDto,
    schemaName?: string,
  ): Promise<{
    payments: Payment[];
    total: number;
    page: number;
    limit: number;
  }> {
    return this.paymentQueriesService.getAllPayments(filters, schemaName);
  }

  /**
   * Obtener estadísticas generales (Admin)
   */
  async getAdminStats(schemaName?: string): Promise<PaymentStats> {
    return this.paymentQueriesService.getAdminStats(schemaName);
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
    return this.paymentCreationService.createPaymentAsAdmin(
      dto,
      adminId,
      schemaName,
    );
  }

  /**
   * Exportar pagos como CSV (Admin)
   */
  async exportPaymentsCsv(
    filters: PaymentFiltersDto,
    schemaName?: string,
  ): Promise<string> {
    return this.paymentQueriesService.exportPaymentsCsv(filters, schemaName);
  }

  /**
   * Obtener un pago por ID
   */
  async getPaymentById(
    id: number,
    tenantId?: number,
    schemaName?: string,
  ): Promise<Payment> {
    return this.paymentQueriesService.getPaymentById(id, tenantId, schemaName);
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
    return this.paymentStatusService.updatePaymentStatus(
      id,
      dto,
      adminId,
      schemaName,
    );
  }

  /**
   * Eliminar un pago (Admin)
   */
  async deletePayment(id: number, schemaName?: string): Promise<void> {
    const schema = schemaName || 'public';
    const table = `${quoteIdent(schema)}.payments`;
    const rows = await this.dataSource.query<{ status: string }[]>(
      `SELECT status FROM ${table} WHERE id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }

    if (
      [PaymentStatus.APPROVED, PaymentStatus.PROCESSING].includes(
        rows[0].status as PaymentStatus,
      )
    ) {
      throw new BadRequestException(
        `No se puede eliminar un pago en estado ${rows[0].status}`,
      );
    }

    await this.dataSource.query(`DELETE FROM ${table} WHERE id = $1`, [id]);
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
    return isValidPaymentStatusTransition(from, to);
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
    return this.paymentStatusService.approvePayment(
      id,
      dto,
      adminId,
      schemaName,
    );
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
    return this.paymentStatusService.rejectPayment(
      id,
      dto,
      adminId,
      schemaName,
    );
  }

  /**
   * Retorna los métodos de pago disponibles para el tenant según su configuración.
   * El frontend usa esto para construir el formulario de pago.
   */
  async getAvailablePaymentMethods(
    tenantSlug: string,
  ): Promise<{ method: string; label: string }[]> {
    return this.paymentMethodsService.getAvailablePaymentMethods(tenantSlug);
  }

  /**
   * Crear un reembolso (Admin)
   */
  async createRefund(
    paymentId: number,
    dto: CreateRefundDto,
    adminId: number,
    schemaName?: string,
  ): Promise<void> {
    return this.paymentRefundsService.createRefund(
      paymentId,
      dto,
      adminId,
      schemaName,
    );
  }

  /**
   * Actualiza el estado de un pago a partir del resultado de un webhook externo.
   * Busca el pago por reference_number (donde se guarda el transaction_id del procesador).
   */
  async handleWebhookResult(
    tenantSlug: string,
    result: WebhookResult,
    processor: string = 'unknown',
  ): Promise<void> {
    return this.paymentWebhookService.handleWebhookResult(
      tenantSlug,
      result,
      processor,
    );
  }
}
