import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreatePaymentAsAdminDto, CreatePaymentDto } from './dto';
import { Payment } from './interfaces/payment.interface';
import { PaymentProcessor, PaymentStatus } from './enums';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';
import { PaymentCreationNotificationService } from './payment-creation-notification.service';
import { PaymentCreationValidationService } from './payment-creation-validation.service';

@Injectable()
export class PaymentCreationService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly paymentCreationValidationService: PaymentCreationValidationService,
    private readonly paymentCreationNotificationService: PaymentCreationNotificationService,
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
        const contract =
          await this.paymentCreationValidationService.resolveActiveContractForTenant(
            queryRunner,
            tenantId,
            schemaPrefix,
          );

        contractId = contract.id;
        propertyId = contract.property_id;
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
      await this.paymentCreationNotificationService.notifyAdminsOfPendingPayment(
        {
          dataSourceQuery: <T>(sql: string, params?: unknown[]) =>
            this.dataSource.query<T[]>(sql, params),
          schemaName,
          schemaPrefix,
          tenantSlug,
          payment,
          amount: dto.amount,
          currency: dto.currency || 'BOB',
          hasReceipt: !!receiptPath,
        },
      );

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
      await this.paymentCreationValidationService.validateAdminPaymentContract(
        queryRunner,
        dto,
        schemaPrefix,
      );

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
        await this.paymentCreationNotificationService.notifyTenantOfApprovedPayment(
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

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
