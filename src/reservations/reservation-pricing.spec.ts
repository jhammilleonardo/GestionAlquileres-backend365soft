import { priceReservation, PricingInput } from './reservation-pricing';

function input(overrides?: Partial<PricingInput>): PricingInput {
  return {
    pricePerNight: 80,
    nights: 5,
    cleaningFee: 20,
    weeklyDiscountPct: 0,
    monthlyDiscountPct: 0,
    occupancyTaxPct: 0,
    ...overrides,
  };
}

describe('priceReservation', () => {
  it('calcula base + limpieza sin descuentos ni impuesto', () => {
    const r = priceReservation(input());
    expect(r.baseAmount).toBe(400);
    expect(r.subtotal).toBe(420);
    expect(r.discountTotal).toBe(0);
    expect(r.taxTotal).toBe(0);
    expect(r.total).toBe(420);
    expect(r.lines).toHaveLength(2); // nightly + cleaning
  });

  it('aplica descuento semanal en 7+ noches', () => {
    const r = priceReservation(input({ nights: 7, weeklyDiscountPct: 10 }));
    // 80*7=560; -10% = -56
    expect(r.discountTotal).toBe(-56);
    expect(r.total).toBe(560 - 56 + 20);
  });

  it('prioriza el descuento mensual sobre el semanal en 28+ noches', () => {
    const r = priceReservation(
      input({ nights: 28, weeklyDiscountPct: 10, monthlyDiscountPct: 25 }),
    );
    expect(r.lines.find((l) => l.concept === 'monthly_discount')).toBeDefined();
    expect(
      r.lines.find((l) => l.concept === 'weekly_discount'),
    ).toBeUndefined();
    expect(r.discountTotal).toBe(-(80 * 28 * 0.25));
  });

  it('grava con impuesto de ocupación el alojamiento neto (no la limpieza)', () => {
    const r = priceReservation(
      input({ nights: 7, weeklyDiscountPct: 10, occupancyTaxPct: 10 }),
    );
    // neto = 560 - 56 = 504; impuesto 10% = 50.4
    expect(r.taxTotal).toBe(50.4);
    // total = subtotal(580) + descuento(-56) + impuesto(50.4)
    expect(r.total).toBe(580 - 56 + 50.4);
  });

  it('omite la línea de limpieza si es 0', () => {
    const r = priceReservation(input({ cleaningFee: 0 }));
    expect(r.lines.find((l) => l.concept === 'cleaning_fee')).toBeUndefined();
  });

  it('suma el depósito a totalDue pero no al total del alojamiento', () => {
    const r = priceReservation(input({ securityDeposit: 150 }));
    expect(r.total).toBe(420); // alojamiento sin depósito
    expect(r.deposit).toBe(150);
    expect(r.totalDue).toBe(570);
    expect(r.lines.find((l) => l.concept === 'security_deposit')?.amount).toBe(
      150,
    );
  });

  it('sin depósito, totalDue = total', () => {
    const r = priceReservation(input());
    expect(r.deposit).toBe(0);
    expect(r.totalDue).toBe(r.total);
    expect(
      r.lines.find((l) => l.concept === 'security_deposit'),
    ).toBeUndefined();
  });

  it('aplica ajuste de fin de semana únicamente a viernes y sábado', () => {
    const r = priceReservation(
      input({
        nights: 3,
        cleaningFee: 0,
        nightlyPrices: [100, 100, 100],
        nightlyDates: ['2026-06-19', '2026-06-20', '2026-06-21'],
        weekendAdjustmentPct: 20,
      }),
    );

    expect(
      r.lines.find((line) => line.concept === 'weekend_adjustment')?.amount,
    ).toBe(40);
    expect(r.total).toBe(340);
  });

  it('aplica descuento anticipado cuando supera el umbral', () => {
    const r = priceReservation(
      input({
        cleaningFee: 0,
        leadTimeDays: 90,
        earlyBirdMinDays: 60,
        earlyBirdDiscountPct: 10,
      }),
    );

    expect(
      r.lines.find((line) => line.concept === 'early_bird_discount')?.amount,
    ).toBe(-40);
    expect(r.total).toBe(360);
  });

  it('prioriza la regla de última hora y permite recargo', () => {
    const r = priceReservation(
      input({
        cleaningFee: 0,
        leadTimeDays: 2,
        earlyBirdMinDays: 1,
        earlyBirdDiscountPct: 10,
        lastMinuteMaxDays: 3,
        lastMinuteAdjustmentPct: 25,
      }),
    );

    expect(
      r.lines.find((line) => line.concept === 'last_minute_adjustment')?.amount,
    ).toBe(100);
    expect(
      r.lines.find((line) => line.concept === 'early_bird_discount'),
    ).toBeUndefined();
    expect(r.total).toBe(500);
  });
});
