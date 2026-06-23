import { ConflictException, Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

interface PayableReservationRow {
  id: number;
  status: string;
  total_amount: string | number;
  deposit_required: string | number | null;
  hold_expired: boolean;
}

@Injectable()
export class ReservationPaymentConfirmationService {
  async confirmIfFullyPaid(
    queryRunner: QueryRunner,
    schemaName: string,
    reservationId?: number | null,
  ): Promise<boolean> {
    if (!reservationId) return false;

    const schema = quoteIdent(schemaName);
    const reservations = (await queryRunner.query(
      `SELECT id, status, total_amount, deposit_required,
              (expires_at IS NOT NULL AND expires_at <= NOW()) AS hold_expired
         FROM ${schema}.reservations
        WHERE id = $1
        FOR UPDATE`,
      [reservationId],
    )) as PayableReservationRow[];
    const reservation = reservations[0];

    if (!reservation || reservation.status !== 'pending_payment') return false;
    if (reservation.hold_expired) {
      throw new ConflictException(
        'La retención de la reserva expiró; no se puede aprobar este pago',
      );
    }

    const totals = (await queryRunner.query(
      `SELECT COALESCE(SUM(amount), 0)::numeric AS approved_total
         FROM ${schema}.payments
        WHERE reservation_id = $1 AND status = 'APPROVED'`,
      [reservationId],
    )) as Array<{ approved_total: string | number }>;
    const approvedTotal = Number(totals[0]?.approved_total ?? 0);
    // Umbral para confirmar: el adelanto requerido (si la unidad lo define) o,
    // por defecto, el total. El saldo restante se cobra después (p. ej. al check-in).
    const requiredTotal =
      reservation.deposit_required != null
        ? Number(reservation.deposit_required)
        : Number(reservation.total_amount);

    if (approvedTotal + 0.009 < requiredTotal) return false;

    const confirmed = (await queryRunner.query(
      `UPDATE ${schema}.reservations
          SET status = 'confirmed', expires_at = NULL, updated_at = NOW()
        WHERE id = $1 AND status = 'pending_payment'
        RETURNING id`,
      [reservationId],
    )) as Array<{ id: number }>;

    return confirmed.length === 1;
  }
}
