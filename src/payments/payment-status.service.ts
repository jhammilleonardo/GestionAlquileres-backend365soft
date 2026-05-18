import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import {
  ApprovePaymentDto,
  RejectPaymentDto,
  UpdatePaymentStatusDto,
} from './dto';
import { Payment } from './interfaces/payment.interface';
import { PaymentStatus } from './enums';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { SplitPaymentService } from '../split-payment/split-payment.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { quoteIdent } from '../common/utils/sql-identifier';

interface PaymentStatusRow {
  id: number;
  tenant_id: number;
  property_id: number;
  amount: string | number;
  currency: string;
  payment_date: string | Date;
  status: PaymentStatus;
  admin_notes?: string | null;
  rejection_reason?: string | null;
}

const ALLOWED_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  [PaymentStatus.PENDING]: [
    PaymentStatus.PROCESSING,
    PaymentStatus.APPROVED,
    PaymentStatus.REJECTED,
    PaymentStatus.FAILED,
  ],
  [PaymentStatus.PROCESSING]: [PaymentStatus.APPROVED, PaymentStatus.FAILED],
  [PaymentStatus.APPROVED]: [
    PaymentStatus.REFUNDED,
    PaymentStatus.REVERSED,
    PaymentStatus.DISPUTED,
  ],
  [PaymentStatus.DISPUTED]: [PaymentStatus.APPROVED, PaymentStatus.REVERSED],
  [PaymentStatus.REJECTED]: [],
  [PaymentStatus.FAILED]: [],
  [PaymentStatus.REFUNDED]: [],
  [PaymentStatus.REVERSED]: [],
};

export function isValidPaymentStatusTransition(
  from: string,
  to: string,
): boolean {
  if (!isPaymentStatus(from) || !isPaymentStatus(to)) {
    return false;
  }

  return ALLOWED_TRANSITIONS[from].includes(to);
}

function isPaymentStatus(value: string): value is PaymentStatus {
  return Object.values(PaymentStatus).includes(value as PaymentStatus);
}

@Injectable()
export class PaymentStatusService {
  private readonly logger = new Logger(PaymentStatusService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly splitPaymentService: SplitPaymentService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async updatePaymentStatus(
    id: number,
    dto: UpdatePaymentStatusDto,
    adminId: number,
    schemaName?: string,
  ): Promise<Payment> {
    const table = this.paymentTable(schemaName);

    try {
      const rows = await this.dataSource.query<PaymentStatusRow[]>(
        `SELECT * FROM ${table} WHERE id = $1`,
        [id],
      );
      const payment = rows[0];

      if (!payment) {
        throw new NotFoundException(`Pago #${id} no encontrado`);
      }

      if (
        payment.status !== dto.status &&
        !isValidPaymentStatusTransition(payment.status, dto.status)
      ) {
        throw new BadRequestException(
          `Transición ${payment.status} -> ${dto.status} no permitida`,
        );
      }

      const isApproved = dto.status === PaymentStatus.APPROVED;
      const updated = await this.dataSource.query<Payment[]>(
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
          dto.admin_notes || payment.admin_notes,
          dto.rejection_reason || payment.rejection_reason,
          adminId,
          id,
          isApproved,
        ],
      );

      await this.notifyStatusChange(payment, id, dto, schemaName);

      return updated[0];
    } catch (error) {
      this.logger.error(
        '[updatePaymentStatus] Error',
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    }
  }

  async approvePayment(
    id: number,
    dto: ApprovePaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let payment: PaymentStatusRow | undefined;
    let updatedPayment: Payment | undefined;

    try {
      payment = await this.getPaymentForUpdate(queryRunner, id, schemaName);

      if (
        payment.status !== PaymentStatus.PENDING &&
        payment.status !== PaymentStatus.PROCESSING
      ) {
        throw new BadRequestException(
          `Solo se pueden aprobar pagos en estado PENDING o PROCESSING. Estado actual: ${payment.status}`,
        );
      }

      const updated = (await queryRunner.query(
        `UPDATE ${this.paymentTable(schemaName)}
         SET status      = $1,
             admin_notes = COALESCE($2, admin_notes),
             approved_by = $3,
             approved_at = NOW(),
             updated_at  = NOW()
         WHERE id = $4
         RETURNING *`,
        [PaymentStatus.APPROVED, dto.admin_notes || null, adminId, id],
      )) as Payment[];
      updatedPayment = updated[0];

      await this.splitPaymentService.executeSplit(
        {
          paymentId: id,
          totalAmount: Number(payment.amount),
          propertyId: payment.property_id,
          paymentDate: new Date(payment.payment_date),
          currency: payment.currency,
          schemaName,
        },
        queryRunner,
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (!payment || !updatedPayment) {
      throw new Error(`No se pudo aprobar el pago #${id}`);
    }

    await this.notifyApprovedSafely(payment, id, schemaName);
    await this.auditLogsService.log({
      userId: adminId,
      action: AuditAction.APPROVED,
      entityType: 'payment',
      entityId: id,
      oldValues: { status: payment.status },
      newValues: {
        status: PaymentStatus.APPROVED,
        admin_notes: dto.admin_notes,
      },
    });

    return updatedPayment;
  }

  async rejectPayment(
    id: number,
    dto: RejectPaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();
    let payment: PaymentStatusRow | undefined;
    let updatedPayment: Payment | undefined;

    try {
      payment = await this.getPaymentForUpdate(queryRunner, id, schemaName);

      if (
        payment.status !== PaymentStatus.PENDING &&
        payment.status !== PaymentStatus.PROCESSING
      ) {
        throw new BadRequestException(
          `Solo se pueden rechazar pagos en estado PENDING o PROCESSING. Estado actual: ${payment.status}`,
        );
      }

      const updated = (await queryRunner.query(
        `UPDATE ${this.paymentTable(schemaName)}
         SET status           = $1,
             rejection_reason = $2,
             admin_notes      = COALESCE($3, admin_notes),
             approved_by      = $4,
             updated_at       = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          PaymentStatus.REJECTED,
          dto.rejection_reason,
          dto.admin_notes || null,
          adminId,
          id,
        ],
      )) as Payment[];
      updatedPayment = updated[0];

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (!payment || !updatedPayment) {
      throw new Error(`No se pudo rechazar el pago #${id}`);
    }

    await this.notifyRejectedSafely(
      payment,
      id,
      dto.rejection_reason,
      schemaName,
    );
    await this.auditLogsService.log({
      userId: adminId,
      action: AuditAction.REJECTED,
      entityType: 'payment',
      entityId: id,
      oldValues: { status: payment.status },
      newValues: {
        status: PaymentStatus.REJECTED,
        rejection_reason: dto.rejection_reason,
      },
    });

    return updatedPayment;
  }

  private async getPaymentForUpdate(
    queryRunner: QueryRunner,
    id: number,
    schemaName: string,
  ): Promise<PaymentStatusRow> {
    const rows = (await queryRunner.query(
      `SELECT * FROM ${this.paymentTable(schemaName)} WHERE id = $1 FOR UPDATE`,
      [id],
    )) as PaymentStatusRow[];
    const payment = rows[0];

    if (!payment) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }

    return payment;
  }

  private async notifyStatusChange(
    payment: PaymentStatusRow,
    paymentId: number,
    dto: UpdatePaymentStatusDto,
    schemaName?: string,
  ): Promise<void> {
    try {
      if (dto.status === PaymentStatus.APPROVED) {
        await this.notifyApproved(payment, paymentId, schemaName);
      } else if (dto.status === PaymentStatus.REJECTED) {
        await this.notifyRejected(
          payment,
          paymentId,
          dto.rejection_reason || '',
          schemaName,
        );
      }
    } catch {
      // Las notificaciones no deben romper la operación de pago.
    }
  }

  private async notifyApprovedSafely(
    payment: PaymentStatusRow,
    paymentId: number,
    schemaName?: string,
  ): Promise<void> {
    try {
      await this.notifyApproved(payment, paymentId, schemaName);
    } catch {
      // Las notificaciones no deben romper la operación de pago.
    }
  }

  private async notifyRejectedSafely(
    payment: PaymentStatusRow,
    paymentId: number,
    rejectionReason: string,
    schemaName?: string,
  ): Promise<void> {
    try {
      await this.notifyRejected(
        payment,
        paymentId,
        rejectionReason,
        schemaName,
      );
    } catch {
      // Las notificaciones no deben romper la operación de pago.
    }
  }

  private async notifyApproved(
    payment: PaymentStatusRow,
    paymentId: number,
    schemaName?: string,
  ): Promise<void> {
    await this.notifyTenant(
      schemaName,
      payment.tenant_id,
      NotificationEventType.PAYMENT_APPROVED,
      'Pago aprobado',
      `Tu pago de ${payment.amount} ${payment.currency} ha sido aprobado`,
      {
        payment_id: paymentId,
        amount: payment.amount,
        currency: payment.currency,
      },
    );
  }

  private async notifyRejected(
    payment: PaymentStatusRow,
    paymentId: number,
    rejectionReason: string,
    schemaName?: string,
  ): Promise<void> {
    await this.notifyTenant(
      schemaName,
      payment.tenant_id,
      NotificationEventType.PAYMENT_REJECTED,
      'Pago rechazado',
      `Tu pago de ${payment.amount} ${payment.currency} fue rechazado: ${rejectionReason}`,
      {
        payment_id: paymentId,
        amount: payment.amount,
        currency: payment.currency,
        rejection_reason: rejectionReason,
      },
    );
  }

  private async notifyTenant(
    schemaName: string | undefined,
    tenantId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (schemaName) {
      await this.notificationsService.createForUserInSchema(
        schemaName,
        tenantId,
        eventType,
        title,
        message,
        metadata,
      );
      return;
    }

    await this.notificationsService.createForUser(
      tenantId,
      eventType,
      title,
      message,
      metadata,
    );
  }

  private paymentTable(schemaName?: string): string {
    return `${quoteIdent(schemaName || 'public')}.payments`;
  }
}
