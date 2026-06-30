import { Injectable, Logger } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { PaymentStatus } from '../payments/enums';
import { MoneyDecimal, MONEY_ROUNDING } from '../common/money';

interface ApprovedPaymentRow {
  id: number;
  amount: string;
}

/**
 * Aplica reembolsos a los pagos aprobados de una reserva al cancelarla. Recibe
 * el `QueryRunner` de la transacción de cancelación para que reserva, liberación
 * de noches y reembolso sean atómicos. Usa nombres de tabla sin calificar: corre
 * dentro del request con `search_path` del tenant ya fijado.
 */
@Injectable()
export class ReservationRefundService {
  private readonly logger = new Logger(ReservationRefundService.name);

  /**
   * Reembolsa el `refundPercentage` de cada pago aprobado de la reserva: inserta
   * el `payment_refunds` y marca el pago como REFUNDED. Devuelve el total
   * reembolsado. Si el porcentaje es 0, no hace nada.
   */
  async refundApprovedPayments(
    queryRunner: QueryRunner,
    reservationId: number,
    refundPercentage: number,
    processedBy: number,
  ): Promise<number> {
    if (refundPercentage <= 0) return 0;

    const payments = (await queryRunner.query(
      `SELECT id, amount FROM payments
        WHERE reservation_id = $1 AND status = $2`,
      [reservationId, PaymentStatus.APPROVED],
    )) as ApprovedPaymentRow[];

    let totalRefunded = 0;

    for (const payment of payments) {
      // Reembolso exacto (decimal, sin float): monto * porcentaje / 100.
      const refundAmount = new MoneyDecimal(payment.amount)
        .times(refundPercentage)
        .div(100)
        .toDecimalPlaces(2, MONEY_ROUNDING)
        .toNumber();
      if (refundAmount <= 0) continue;

      await queryRunner.query(
        `INSERT INTO payment_refunds
           (payment_id, amount, reason, refund_method, refund_date, processed_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [
          payment.id,
          refundAmount,
          'reservation_cancellation',
          'reservation_cancellation',
          processedBy,
        ],
      );

      await queryRunner.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.REFUNDED, payment.id],
      );

      totalRefunded += refundAmount;
    }

    if (totalRefunded > 0) {
      this.logger.log(
        `Reserva ${reservationId}: reembolsados ${totalRefunded} (${refundPercentage}%) en ${payments.length} pago(s)`,
      );
    }
    return this.round2(totalRefunded);
  }

  /**
   * Reembolsa un monto ABSOLUTO repartiéndolo sobre los pagos aprobados (de cada
   * uno se reembolsa hasta su importe). Para reembolsos que no son un % simple
   * del total: depósito reembolsable + alquiler por política, o devolución del
   * depósito al completar. Devuelve el total efectivamente reembolsado.
   */
  async refundAbsoluteAmount(
    queryRunner: QueryRunner,
    reservationId: number,
    amount: number,
    processedBy: number,
    reason = 'reservation_cancellation',
  ): Promise<number> {
    if (amount <= 0) return 0;

    const payments = (await queryRunner.query(
      `SELECT id, amount FROM payments
        WHERE reservation_id = $1 AND status = $2
        ORDER BY id`,
      [reservationId, PaymentStatus.APPROVED],
    )) as ApprovedPaymentRow[];

    let remaining = this.round2(amount);
    let totalRefunded = 0;

    for (const payment of payments) {
      if (remaining <= 0) break;
      const refundAmount = this.round2(
        Math.min(remaining, Number(payment.amount)),
      );
      if (refundAmount <= 0) continue;

      await queryRunner.query(
        `INSERT INTO payment_refunds
           (payment_id, amount, reason, refund_method, refund_date, processed_by)
         VALUES ($1, $2, $3, $4, NOW(), $5)`,
        [payment.id, refundAmount, reason, reason, processedBy],
      );
      await queryRunner.query(
        `UPDATE payments SET status = $1, updated_at = NOW() WHERE id = $2`,
        [PaymentStatus.REFUNDED, payment.id],
      );

      remaining = this.round2(remaining - refundAmount);
      totalRefunded += refundAmount;
    }

    if (totalRefunded > 0) {
      this.logger.log(
        `Reserva ${reservationId}: reembolsados ${totalRefunded} (monto fijo, ${reason})`,
      );
    }
    return this.round2(totalRefunded);
  }

  private round2(value: number): number {
    return new MoneyDecimal(value)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
  }
}
