import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { AccountingOutboxService } from '../accounting/accounting-outbox.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { SplitPaymentService } from '../split-payment/split-payment.service';
import { ApprovePaymentDto, RejectPaymentDto } from './dto';
import { PaymentStatus } from './enums';
import { Payment } from './interfaces/payment.interface';
import { PaymentStatusNotificationService } from './payment-status-notification.service';
import {
  firstReturnedRow,
  PaymentStatusRow,
  paymentTable,
} from './payment-status.types';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';

@Injectable()
export class PaymentApprovalService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly splitPaymentService: SplitPaymentService,
    private readonly auditLogsService: AuditLogsService,
    private readonly paymentStatusNotificationService: PaymentStatusNotificationService,
    private readonly accountingOutboxService: AccountingOutboxService,
    private readonly reservationConfirmationService: ReservationPaymentConfirmationService,
  ) {}

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
        `UPDATE ${paymentTable(schemaName)}
         SET status      = $1,
             admin_notes = COALESCE($2, admin_notes),
             approved_by = $3,
             approved_at = NOW(),
             accounting_status = 'pending_posting',
             journal_entry_id = NULL,
             updated_at  = NOW()
         WHERE id = $4
         RETURNING *`,
        [PaymentStatus.APPROVED, dto.admin_notes || null, adminId, id],
      )) as Payment[];
      updatedPayment = firstReturnedRow<Payment>(updated);

      await this.reservationConfirmationService.confirmIfFullyPaid(
        queryRunner,
        schemaName,
        payment.reservation_id,
      );

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

      await this.accountingOutboxService.enqueue(
        {
          schemaName,
          eventType: 'payment.approved',
          aggregateType: 'payment',
          aggregateId: String(id),
          payload: {
            paymentId: id,
            approvedBy: adminId,
          },
        },
        { queryRunner },
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

    await this.paymentStatusNotificationService.notifyApprovedSafely(
      payment,
      id,
      schemaName,
    );
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
        `UPDATE ${paymentTable(schemaName)}
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
      updatedPayment = firstReturnedRow<Payment>(updated);

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

    await this.paymentStatusNotificationService.notifyRejectedSafely(
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
      `SELECT * FROM ${paymentTable(schemaName)} WHERE id = $1 FOR UPDATE`,
      [id],
    )) as PaymentStatusRow[];
    const payment = rows[0];

    if (!payment) {
      throw new NotFoundException(`Pago #${id} no encontrado`);
    }

    return payment;
  }
}
