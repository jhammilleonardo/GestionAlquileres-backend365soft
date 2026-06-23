import {
  computeCancellationRefund,
  computeRefundableAmount,
  computeDepositPaid,
} from './cancellation-policy';

const CHECKIN = new Date('2099-06-20T00:00:00Z');

/** Cancelación N días antes del check-in. */
function cancelDaysBefore(days: number): Date {
  return new Date(CHECKIN.getTime() - days * 24 * 60 * 60 * 1000);
}

describe('computeCancellationRefund', () => {
  it('non_refundable nunca reembolsa', () => {
    expect(
      computeCancellationRefund('non_refundable', CHECKIN, cancelDaysBefore(30))
        .refundPercentage,
    ).toBe(0);
  });

  it('después del check-in nunca reembolsa', () => {
    const result = computeCancellationRefund(
      'flexible',
      CHECKIN,
      cancelDaysBefore(-1), // un día después
    );
    expect(result.refundPercentage).toBe(0);
    expect(result.reason).toBe('no_refund_after_checkin');
  });

  it('flexible: 100% con ≥1 día, 0% si es el mismo día', () => {
    expect(
      computeCancellationRefund('flexible', CHECKIN, cancelDaysBefore(1))
        .refundPercentage,
    ).toBe(100);
    expect(
      computeCancellationRefund('flexible', CHECKIN, cancelDaysBefore(0.5))
        .refundPercentage,
    ).toBe(0);
  });

  it('moderate: 100% ≥5 días, 50% ≥1 día, 0% si menos', () => {
    expect(
      computeCancellationRefund('moderate', CHECKIN, cancelDaysBefore(5))
        .refundPercentage,
    ).toBe(100);
    expect(
      computeCancellationRefund('moderate', CHECKIN, cancelDaysBefore(2))
        .refundPercentage,
    ).toBe(50);
    expect(
      computeCancellationRefund('moderate', CHECKIN, cancelDaysBefore(0.5))
        .refundPercentage,
    ).toBe(0);
  });

  it('strict: 50% ≥7 días, 0% si menos', () => {
    expect(
      computeCancellationRefund('strict', CHECKIN, cancelDaysBefore(7))
        .refundPercentage,
    ).toBe(50);
    expect(
      computeCancellationRefund('strict', CHECKIN, cancelDaysBefore(3))
        .refundPercentage,
    ).toBe(0);
  });
});

describe('computeRefundableAmount', () => {
  // total 570 = 420 alquiler + 150 depósito
  const rentPortion = 420;

  it('alquiler por política + depósito íntegro (pago completo)', () => {
    // 0% alquiler pero el depósito vuelve entero
    expect(computeRefundableAmount(0, 570, rentPortion)).toBe(150);
    // 50% alquiler (210) + depósito (150)
    expect(computeRefundableAmount(50, 570, rentPortion)).toBe(360);
    // 100% → todo
    expect(computeRefundableAmount(100, 570, rentPortion)).toBe(570);
  });

  it('pago parcial menor al alquiler: aún no hay depósito pagado', () => {
    // pagó 200 (< 420 alquiler) → todo es alquiler; 50% = 100
    expect(computeRefundableAmount(50, 200, rentPortion)).toBe(100);
  });
});

describe('computeDepositPaid', () => {
  it('es lo pagado por encima del alquiler', () => {
    expect(computeDepositPaid(570, 420)).toBe(150);
    expect(computeDepositPaid(420, 420)).toBe(0);
    expect(computeDepositPaid(300, 420)).toBe(0);
  });
});
