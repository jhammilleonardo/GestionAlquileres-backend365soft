import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import {
  ApprovePaymentDto,
  RejectPaymentDto,
  UpdatePaymentStatusDto,
} from './dto';
import { Payment } from './interfaces/payment.interface';
import { PaymentStatus } from './enums';
import { PaymentApprovalService } from './payment-approval.service';
import { PaymentStatusNotificationService } from './payment-status-notification.service';
import {
  firstReturnedRow,
  PaymentStatusRow,
  paymentTable,
} from './payment-status.types';

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
    private readonly paymentApprovalService: PaymentApprovalService,
    private readonly paymentStatusNotificationService: PaymentStatusNotificationService,
  ) {}

  async updatePaymentStatus(
    id: number,
    dto: UpdatePaymentStatusDto,
    adminId: number,
    schemaName?: string,
  ): Promise<Payment> {
    if (dto.status === PaymentStatus.APPROVED) {
      return this.paymentApprovalService.approvePayment(
        id,
        { admin_notes: dto.admin_notes },
        adminId,
        schemaName || 'public',
      );
    }

    const table = paymentTable(schemaName);

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

      const updated = await this.dataSource.query<Payment[]>(
        `UPDATE ${table}
         SET status = $1,
             admin_notes = $2,
             rejection_reason = $3,
             approved_by = $4,
             approved_at = approved_at,
             updated_at = NOW()
         WHERE id = $5
         RETURNING *`,
        [
          dto.status,
          dto.admin_notes || payment.admin_notes,
          dto.rejection_reason || payment.rejection_reason,
          adminId,
          id,
        ],
      );

      await this.notifyStatusChange(payment, id, dto, schemaName);

      return firstReturnedRow<Payment>(updated)!;
    } catch (error) {
      if (
        !(error instanceof BadRequestException) &&
        !(error instanceof NotFoundException)
      ) {
        this.logger.error(
          '[updatePaymentStatus] Error',
          error instanceof Error ? error.stack : undefined,
        );
      }
      throw error;
    }
  }

  async approvePayment(
    id: number,
    dto: ApprovePaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    return this.paymentApprovalService.approvePayment(
      id,
      dto,
      adminId,
      schemaName,
    );
  }

  async rejectPayment(
    id: number,
    dto: RejectPaymentDto,
    adminId: number,
    schemaName: string,
  ): Promise<Payment> {
    return this.paymentApprovalService.rejectPayment(
      id,
      dto,
      adminId,
      schemaName,
    );
  }

  private async notifyStatusChange(
    payment: PaymentStatusRow,
    paymentId: number,
    dto: UpdatePaymentStatusDto,
    schemaName?: string,
  ): Promise<void> {
    try {
      if (dto.status === PaymentStatus.APPROVED) {
        await this.paymentStatusNotificationService.notifyApprovedSafely(
          payment,
          paymentId,
          schemaName,
        );
      } else if (dto.status === PaymentStatus.REJECTED) {
        await this.paymentStatusNotificationService.notifyRejectedSafely(
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
}
