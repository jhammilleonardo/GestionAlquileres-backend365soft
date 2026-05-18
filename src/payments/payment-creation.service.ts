import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreatePaymentAsAdminDto, CreatePaymentDto } from './dto';
import { Payment } from './interfaces/payment.interface';
import { PaymentProcessor, PaymentStatus } from './enums';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';

interface ActiveContractRow {
  id: number;
  property_id: number;
}

interface ContractValidationRow {
  id: number;
  tenant_id: number;
  property_id: number;
  status: string;
}

@Injectable()
export class PaymentCreationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async createPayment(
    tenantId: number,
    dto: CreatePaymentDto,
    tenantSlug?: string,
    contractId?: number,
    propertyId?: number,
    receiptPath?: string,
  ): Promise<Payment> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      if (!contractId) {
        const contracts = (await queryRunner.query(
          `SELECT id, property_id FROM ${schemaPrefix}contracts
           WHERE tenant_id = $1 AND status IN ('ACTIVO', 'POR_VENCER')
           ORDER BY created_at DESC LIMIT 1`,
          [tenantId],
        )) as ActiveContractRow[];

        if (contracts.length === 0) {
          throw new BadRequestException('No tiene un contrato activo');
        }

        contractId = contracts[0].id;
        propertyId = contracts[0].property_id;
      }

      const payments = (await queryRunner.query(
        `INSERT INTO ${schemaPrefix}payments (
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
      )) as Payment[];
      const payment = payments[0];

      if (!payment) {
        throw new Error('No se pudo crear el pago');
      }

      await queryRunner.commitTransaction();
      await this.notifyAdminsOfPendingPayment({
        schemaName,
        schemaPrefix,
        tenantSlug,
        payment,
        amount: dto.amount,
        currency: dto.currency || 'BOB',
        hasReceipt: !!receiptPath,
      });

      return payment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async createPaymentAsAdmin(
    dto: CreatePaymentAsAdminDto,
    adminId: number,
    schemaName?: string,
  ): Promise<Payment> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const contracts = (await queryRunner.query(
        `SELECT id, tenant_id, property_id, status FROM ${schemaPrefix}contracts WHERE id = $1`,
        [dto.contract_id],
      )) as ContractValidationRow[];

      if (contracts.length === 0) {
        throw new NotFoundException(
          `Contrato #${dto.contract_id} no encontrado`,
        );
      }

      this.validateContractBelongsToPayment(contracts[0], dto);

      const metadata = this.buildAdminMetadata(dto);
      const payments = (await queryRunner.query(
        `INSERT INTO ${schemaPrefix}payments (
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
          adminId,
          dto.status === PaymentStatus.APPROVED ? adminId : null,
          dto.status === PaymentStatus.APPROVED ? new Date() : null,
          Object.keys(metadata).length > 0 ? JSON.stringify(metadata) : null,
        ],
      )) as Payment[];
      const payment = payments[0];

      if (!payment) {
        throw new Error('No se pudo crear el pago');
      }

      await queryRunner.commitTransaction();

      if (dto.status === PaymentStatus.APPROVED) {
        await this.notifyTenantOfApprovedPayment(
          dto.tenant_id,
          payment.id,
          dto.amount,
          dto.currency || 'USD',
          schemaName,
        );
      }

      return payment;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateContractBelongsToPayment(
    contract: ContractValidationRow,
    dto: CreatePaymentAsAdminDto,
  ): void {
    if (contract.tenant_id !== dto.tenant_id) {
      throw new BadRequestException(
        'El contrato no pertenece al inquilino especificado',
      );
    }

    if (contract.property_id !== dto.property_id) {
      throw new BadRequestException(
        'El contrato no pertenece a la propiedad especificada',
      );
    }
  }

  private buildAdminMetadata(
    dto: CreatePaymentAsAdminDto,
  ): Record<string, unknown> {
    const metadata: Record<string, unknown> = {};

    if (dto.card_last_4_digits)
      metadata.card_last_4_digits = dto.card_last_4_digits;
    if (dto.card_holder_name) metadata.card_holder_name = dto.card_holder_name;
    if (dto.card_expiry) metadata.card_expiry = dto.card_expiry;
    if (dto.bank_name) metadata.bank_name = dto.bank_name;
    if (dto.bank_account_last_4)
      metadata.bank_account_last_4 = dto.bank_account_last_4;
    if (dto.received_by) metadata.received_by = dto.received_by;

    return metadata;
  }

  private async notifyAdminsOfPendingPayment(params: {
    schemaName: string | null;
    schemaPrefix: string;
    tenantSlug?: string;
    payment: Payment;
    amount: number;
    currency: string;
    hasReceipt: boolean;
  }): Promise<void> {
    try {
      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM ${params.schemaPrefix}"user" WHERE role = 'ADMIN' AND is_active = true LIMIT 5`,
      );
      const receiptNote = params.hasReceipt ? ' con comprobante adjunto' : '';

      await Promise.all(
        admins.map((admin) =>
          params.schemaName
            ? this.notificationsService.createForUserInSchema(
                params.schemaName,
                admin.id,
                NotificationEventType.PAYMENT_CREATED,
                'Pago pendiente de aprobación',
                `Un inquilino registró un pago de ${params.amount} ${params.currency}${receiptNote}. Requiere revisión.`,
                {
                  payment_id: params.payment.id,
                  amount: params.amount,
                  currency: params.currency,
                  has_receipt: params.hasReceipt,
                },
                params.tenantSlug,
              )
            : this.notificationsService.createForUser(
                admin.id,
                NotificationEventType.PAYMENT_CREATED,
                'Pago pendiente de aprobación',
                `Un inquilino registró un pago de ${params.amount} ${params.currency}${receiptNote}. Requiere revisión.`,
                {
                  payment_id: params.payment.id,
                  amount: params.amount,
                  currency: params.currency,
                  has_receipt: params.hasReceipt,
                },
                params.tenantSlug,
              ),
        ),
      );
    } catch {
      // Las notificaciones no deben romper la creación del pago.
    }
  }

  private async notifyTenantOfApprovedPayment(
    tenantId: number,
    paymentId: number,
    amount: number,
    currency: string,
    schemaName?: string,
  ): Promise<void> {
    try {
      if (schemaName) {
        await this.notificationsService.createForUserInSchema(
          schemaName,
          tenantId,
          NotificationEventType.PAYMENT_APPROVED,
          'Pago aprobado',
          `Tu pago de ${amount} ${currency} ha sido aprobado`,
          { payment_id: paymentId, amount, currency },
        );
        return;
      }

      await this.notificationsService.createForUser(
        tenantId,
        NotificationEventType.PAYMENT_APPROVED,
        'Pago aprobado',
        `Tu pago de ${amount} ${currency} ha sido aprobado`,
        { payment_id: paymentId, amount, currency },
      );
    } catch {
      // Las notificaciones no deben romper la creación del pago.
    }
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
