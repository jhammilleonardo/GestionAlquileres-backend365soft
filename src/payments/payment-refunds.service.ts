import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateRefundDto } from './dto';
import { PaymentStatus } from './enums';
import { quoteIdent } from '../common/utils/sql-identifier';

interface RefundablePaymentRow {
  id: number;
  amount: string | number;
  status: PaymentStatus;
}

@Injectable()
export class PaymentRefundsService {
  constructor(private readonly dataSource: DataSource) {}

  async createRefund(
    paymentId: number,
    dto: CreateRefundDto,
    adminId: number,
    schemaName?: string,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const payments = (await queryRunner.query(
        `SELECT id, amount, status
         FROM ${schemaPrefix}payments
         WHERE id = $1
         FOR UPDATE`,
        [paymentId],
      )) as RefundablePaymentRow[];

      if (payments.length === 0) {
        throw new NotFoundException(`Pago #${paymentId} no encontrado`);
      }

      const payment = payments[0];
      if (payment.status !== PaymentStatus.APPROVED) {
        throw new BadRequestException('Solo se reembolsan pagos aprobados');
      }

      const refunded = (await queryRunner.query(
        `SELECT COALESCE(SUM(amount), 0)::numeric AS total
         FROM ${schemaPrefix}payment_refunds
         WHERE payment_id = $1`,
        [paymentId],
      )) as { total: string | number }[];

      const paymentAmountCents = this.toCents(payment.amount);
      const alreadyRefundedCents = this.toCents(refunded[0]?.total ?? 0);
      const refundCents = this.toCents(dto.amount);
      const newRefundTotalCents = alreadyRefundedCents + refundCents;

      if (newRefundTotalCents > paymentAmountCents) {
        throw new BadRequestException(
          'El monto total reembolsado no puede exceder el monto del pago',
        );
      }

      await queryRunner.query(
        `INSERT INTO ${schemaPrefix}payment_refunds (
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

      if (newRefundTotalCents === paymentAmountCents) {
        await queryRunner.query(
          `UPDATE ${schemaPrefix}payments
           SET status = $1, updated_at = NOW()
           WHERE id = $2`,
          [PaymentStatus.REFUNDED, paymentId],
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private toCents(value: string | number): number {
    return Math.round(Number(value) * 100);
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
