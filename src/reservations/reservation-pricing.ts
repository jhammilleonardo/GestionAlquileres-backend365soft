/**
 * Cálculo de precio de una reserva de corto plazo — función pura y única fuente
 * de verdad del pricing. La usan tanto el motor de cotización (`QuoteService`,
 * para mostrar el desglose) como la creación de la reserva (`ReservationsService`,
 * para guardar el monto cobrado), garantizando que lo mostrado = lo cobrado.
 *
 * Abierto/cerrado: un nuevo concepto = una línea más, sin tocar el resto.
 */

export type PriceLineType = 'charge' | 'discount';

export type PriceConcept =
  | 'nightly'
  | 'cleaning_fee'
  | 'weekly_discount'
  | 'monthly_discount'
  | 'weekend_adjustment'
  | 'early_bird_discount'
  | 'last_minute_adjustment'
  | 'occupancy_tax'
  | 'security_deposit';

export interface PriceLine {
  concept: PriceConcept;
  type: PriceLineType;
  /** Monto con signo: positivo para cargos, negativo para descuentos. */
  amount: number;
  detail?: Record<string, number>;
}

export interface PricingInput {
  pricePerNight: number;
  nights: number;
  cleaningFee: number;
  weeklyDiscountPct: number;
  monthlyDiscountPct: number;
  occupancyTaxPct: number;
  /** Depósito de garantía reembolsable (no se grava ni descuenta). */
  securityDeposit?: number;
  /**
   * Precio de cada noche (por temporada). Si se provee, la base es su suma; si
   * no, se usa `pricePerNight × nights` (tarifa plana).
   */
  nightlyPrices?: number[];
  /** Fechas YYYY-MM-DD correspondientes a nightlyPrices. */
  nightlyDates?: string[];
  weekendAdjustmentPct?: number;
  /** Días entre la cotización y el check-in. */
  leadTimeDays?: number;
  earlyBirdMinDays?: number;
  earlyBirdDiscountPct?: number;
  lastMinuteMaxDays?: number;
  /** Positivo = recargo; negativo = descuento. */
  lastMinuteAdjustmentPct?: number;
}

export interface PricingResult {
  lines: PriceLine[];
  baseAmount: number;
  discountTotal: number;
  taxTotal: number;
  subtotal: number;
  /** Total del alojamiento (noches − descuento + limpieza + impuesto). */
  total: number;
  /** Depósito de garantía reembolsable. */
  deposit: number;
  /** Lo que el huésped paga: total del alojamiento + depósito. */
  totalDue: number;
}

/** Umbrales de descuento por duración de la estadía. */
export const WEEKLY_THRESHOLD_NIGHTS = 7;
export const MONTHLY_THRESHOLD_NIGHTS = 28;

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function lengthOfStayDiscount(
  nights: number,
  baseAmount: number,
  input: PricingInput,
): PriceLine | null {
  // El descuento mensual (28+) tiene prioridad sobre el semanal (7+).
  if (nights >= MONTHLY_THRESHOLD_NIGHTS && input.monthlyDiscountPct > 0) {
    return discountLine(
      'monthly_discount',
      baseAmount,
      input.monthlyDiscountPct,
    );
  }
  if (nights >= WEEKLY_THRESHOLD_NIGHTS && input.weeklyDiscountPct > 0) {
    return discountLine('weekly_discount', baseAmount, input.weeklyDiscountPct);
  }
  return null;
}

function discountLine(
  concept: 'weekly_discount' | 'monthly_discount',
  baseAmount: number,
  percentage: number,
): PriceLine {
  return {
    concept,
    type: 'discount',
    amount: round2(-(baseAmount * percentage) / 100),
    detail: { percentage },
  };
}

function percentageLine(
  concept:
    | 'weekend_adjustment'
    | 'early_bird_discount'
    | 'last_minute_adjustment',
  baseAmount: number,
  percentage: number,
): PriceLine | null {
  if (percentage === 0 || baseAmount === 0) return null;
  const amount = round2((baseAmount * percentage) / 100);
  return {
    concept,
    type: amount < 0 ? 'discount' : 'charge',
    amount,
    detail: { percentage: Math.abs(percentage) },
  };
}

function weekendAdjustment(
  input: PricingInput,
  prices: number[],
): PriceLine | null {
  const percentage = input.weekendAdjustmentPct ?? 0;
  if (
    !percentage ||
    !input.nightlyDates ||
    input.nightlyDates.length !== prices.length
  ) {
    return null;
  }

  const weekendBase = prices.reduce((sum, price, index) => {
    const day = new Date(`${input.nightlyDates![index]}T00:00:00Z`).getUTCDay();
    return day === 5 || day === 6 ? sum + price : sum;
  }, 0);
  return percentageLine('weekend_adjustment', weekendBase, percentage);
}

function leadTimeAdjustment(
  input: PricingInput,
  baseAmount: number,
): PriceLine | null {
  const leadDays = input.leadTimeDays;
  if (leadDays === undefined) return null;

  if (
    input.lastMinuteMaxDays !== undefined &&
    leadDays <= input.lastMinuteMaxDays &&
    (input.lastMinuteAdjustmentPct ?? 0) !== 0
  ) {
    return percentageLine(
      'last_minute_adjustment',
      baseAmount,
      input.lastMinuteAdjustmentPct ?? 0,
    );
  }

  if (
    input.earlyBirdMinDays !== undefined &&
    leadDays >= input.earlyBirdMinDays &&
    (input.earlyBirdDiscountPct ?? 0) > 0
  ) {
    return percentageLine(
      'early_bird_discount',
      baseAmount,
      -(input.earlyBirdDiscountPct ?? 0),
    );
  }

  return null;
}

export function priceReservation(input: PricingInput): PricingResult {
  const lines: PriceLine[] = [];

  // Base por temporada (suma de noches) o tarifa plana (precio × noches).
  const baseAmount =
    input.nightlyPrices && input.nightlyPrices.length > 0
      ? round2(input.nightlyPrices.reduce((sum, price) => sum + price, 0))
      : round2(input.pricePerNight * input.nights);
  const displayPricePerNight =
    input.nights > 0 ? round2(baseAmount / input.nights) : input.pricePerNight;
  lines.push({
    concept: 'nightly',
    type: 'charge',
    amount: baseAmount,
    detail: { nights: input.nights, price_per_night: displayPricePerNight },
  });

  const weekend = weekendAdjustment(input, input.nightlyPrices ?? []);
  if (weekend) lines.push(weekend);

  const afterWeekend = round2(baseAmount + (weekend?.amount ?? 0));
  const leadTime = leadTimeAdjustment(input, afterWeekend);
  if (leadTime) lines.push(leadTime);

  const adjustedAccommodation = round2(afterWeekend + (leadTime?.amount ?? 0));

  const discount = lengthOfStayDiscount(
    input.nights,
    adjustedAccommodation,
    input,
  );
  if (discount) lines.push(discount);

  if (input.cleaningFee > 0) {
    lines.push({
      concept: 'cleaning_fee',
      type: 'charge',
      amount: input.cleaningFee,
    });
  }

  const discountTotal = lines
    .filter((line) => line.type === 'discount')
    .reduce((sum, line) => sum + line.amount, 0);

  // El impuesto de ocupación grava el alojamiento neto (noches con descuento),
  // no la limpieza — base habitual del tributo.
  const adjustmentCharges = lines
    .filter(
      (line) =>
        line.type === 'charge' &&
        (line.concept === 'weekend_adjustment' ||
          line.concept === 'last_minute_adjustment'),
    )
    .reduce((sum, line) => sum + line.amount, 0);
  const accommodationNet = round2(
    baseAmount + adjustmentCharges + discountTotal,
  );
  let taxTotal = 0;
  if (input.occupancyTaxPct > 0) {
    taxTotal = round2((accommodationNet * input.occupancyTaxPct) / 100);
    lines.push({
      concept: 'occupancy_tax',
      type: 'charge',
      amount: taxTotal,
      detail: { percentage: input.occupancyTaxPct },
    });
  }

  const subtotal = round2(baseAmount + adjustmentCharges + input.cleaningFee);
  const total = round2(accommodationNet + input.cleaningFee + taxTotal);

  // Depósito de garantía: reembolsable, fuera del cálculo de alojamiento. Se
  // muestra como línea aparte y se suma sólo a lo que el huésped paga (totalDue).
  const deposit = round2(input.securityDeposit ?? 0);
  if (deposit > 0) {
    lines.push({
      concept: 'security_deposit',
      type: 'charge',
      amount: deposit,
    });
  }
  const totalDue = round2(total + deposit);

  return {
    lines,
    baseAmount,
    discountTotal: round2(discountTotal),
    taxTotal,
    subtotal,
    total,
    deposit,
    totalDue,
  };
}
