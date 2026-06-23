/**
 * Política de cancelación de reservas — función pura y única fuente de verdad.
 * Dada la política de la unidad y la antelación de la cancelación respecto al
 * check-in, devuelve el porcentaje reembolsable. Sin BD ni efectos: testeable
 * en aislamiento y reutilizable por cualquier flujo de cancelación.
 */

export type CancellationPolicy =
  | 'flexible'
  | 'moderate'
  | 'strict'
  | 'non_refundable';

export interface RefundComputation {
  /** Porcentaje a reembolsar (0–100). */
  refundPercentage: number;
  /** Clave i18n del motivo (el frontend la traduce). */
  reason:
    | 'full_refund'
    | 'partial_refund'
    | 'no_refund_late'
    | 'no_refund_after_checkin'
    | 'no_refund_policy';
}

const MS_PER_DAY = 1000 * 60 * 60 * 24;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * Monto reembolsable al cancelar, consciente del depósito. Modelo: el pago cubre
 * el ALQUILER primero y el DEPÓSITO queda retenido al final. Por eso:
 *   - la parte de alquiler pagada se reembolsa según la política (`policyPct`);
 *   - la parte de depósito pagada se reembolsa SIEMPRE al 100% (es una garantía).
 * `rentPortion` = total de la reserva − depósito.
 */
export function computeRefundableAmount(
  policyPct: number,
  paid: number,
  rentPortion: number,
): number {
  const rentPaid = Math.min(paid, rentPortion);
  const depositPaid = Math.max(0, paid - rentPortion);
  return round2((rentPaid * policyPct) / 100 + depositPaid);
}

/**
 * Parte de depósito efectivamente pagada (lo que se devuelve al COMPLETAR la
 * estadía: el alquiler se gana, el depósito retenido vuelve).
 */
export function computeDepositPaid(paid: number, rentPortion: number): number {
  return round2(Math.max(0, paid - rentPortion));
}

function daysUntil(checkinDate: Date, cancellationDate: Date): number {
  return (checkinDate.getTime() - cancellationDate.getTime()) / MS_PER_DAY;
}

/**
 * Reglas por política (antelación = días entre la cancelación y el check-in):
 * - flexible:        100% si ≥1 día; si no, 0%.
 * - moderate:        100% si ≥5 días; 50% si ≥1 día; si no, 0%.
 * - strict:          50% si ≥7 días; si no, 0%.
 * - non_refundable:  0% siempre.
 * Tras el check-in nunca hay reembolso.
 */
export function computeCancellationRefund(
  policy: CancellationPolicy,
  checkinDate: Date,
  cancellationDate: Date,
): RefundComputation {
  if (policy === 'non_refundable') {
    return { refundPercentage: 0, reason: 'no_refund_policy' };
  }

  const days = daysUntil(checkinDate, cancellationDate);
  if (days <= 0) {
    return { refundPercentage: 0, reason: 'no_refund_after_checkin' };
  }

  switch (policy) {
    case 'flexible':
      return days >= 1
        ? { refundPercentage: 100, reason: 'full_refund' }
        : { refundPercentage: 0, reason: 'no_refund_late' };
    case 'moderate':
      if (days >= 5) return { refundPercentage: 100, reason: 'full_refund' };
      if (days >= 1) return { refundPercentage: 50, reason: 'partial_refund' };
      return { refundPercentage: 0, reason: 'no_refund_late' };
    case 'strict':
      return days >= 7
        ? { refundPercentage: 50, reason: 'partial_refund' }
        : { refundPercentage: 0, reason: 'no_refund_late' };
  }
}
