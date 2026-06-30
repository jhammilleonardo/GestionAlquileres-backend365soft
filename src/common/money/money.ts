import type Decimal from 'decimal.js';
import { getCurrencyScale, normalizeCurrency } from './currency';
import { MoneyDecimal, MoneyDecimalInstance, MONEY_ROUNDING } from './rounding';

/** Valores aceptados para construir un Money. */
export type MoneyInput = string | number | MoneyDecimalInstance;

/**
 * Value object de dinero (patrón Fowler / dinero.js). Encapsula un monto
 * decimal exacto + su moneda. TODA la aritmética monetaria del sistema debe
 * pasar por aquí: imposibilita usar floats, mezclar monedas o redondear ad-hoc.
 *
 * Inmutable: cada operación devuelve un Money nuevo. El monto interno se guarda
 * a precisión plena (Decimal) y solo se redondea a la escala de la moneda en
 * los puntos de salida explícitos (`round`, `toString`, `toMinorUnits`).
 */
export class Money {
  private constructor(
    private readonly amount: MoneyDecimalInstance,
    readonly currency: string,
  ) {}

  // ─── Constructores ─────────────────────────────────────────────────────────

  /** Crea Money desde un string/number/Decimal en unidades mayores (ej. "1234.56"). */
  static of(value: MoneyInput, currency: string): Money {
    const dec = new MoneyDecimal(value as Decimal.Value);
    if (!dec.isFinite()) {
      throw new Error(`Monto monetario inválido: ${String(value)}`);
    }
    return new Money(dec, normalizeCurrency(currency));
  }

  /** Crea Money desde la unidad mínima entera (ej. 123456 centavos → 1234.56). */
  static fromMinorUnits(units: number | bigint, currency: string): Money {
    const code = normalizeCurrency(currency);
    const scale = getCurrencyScale(code);
    const dec = new MoneyDecimal(units.toString()).div(
      new MoneyDecimal(10).pow(scale),
    );
    return new Money(dec, code);
  }

  /** Cero en la moneda dada. */
  static zero(currency: string): Money {
    return new Money(new MoneyDecimal(0), normalizeCurrency(currency));
  }

  /**
   * Parsea un valor que viene de la base de datos (columna NUMERIC leída como
   * string) directo a Money — NUNCA pasar por Number(). Acepta null/'' → cero.
   */
  static fromDb(
    value: string | number | null | undefined,
    currency: string,
  ): Money {
    if (value === null || value === undefined || value === '') {
      return Money.zero(currency);
    }
    return Money.of(value, currency);
  }

  /** Suma una lista de Money de la misma moneda (vacío → cero requiere currency). */
  static sum(items: Money[], currencyIfEmpty?: string): Money {
    if (items.length === 0) {
      if (!currencyIfEmpty) {
        throw new Error('Money.sum: lista vacía requiere currencyIfEmpty');
      }
      return Money.zero(currencyIfEmpty);
    }
    return items.reduce((acc, m) => acc.add(m));
  }

  // ─── Aritmética ─────────────────────────────────────────────────────────────

  add(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.plus(other.amount), this.currency);
  }

  subtract(other: Money): Money {
    this.assertSameCurrency(other);
    return new Money(this.amount.minus(other.amount), this.currency);
  }

  /** Multiplica por un escalar (ej. cantidad de noches). No es dinero. */
  multiply(factor: MoneyInput): Money {
    return new Money(this.amount.times(factor as Decimal.Value), this.currency);
  }

  /** Aplica un porcentaje: this * (pct / 100). Ej. mora del 2% → percentage(2). */
  percentage(pct: MoneyInput): Money {
    const factor = new MoneyDecimal(pct as Decimal.Value).div(100);
    return new Money(this.amount.times(factor), this.currency);
  }

  negated(): Money {
    return new Money(this.amount.negated(), this.currency);
  }

  abs(): Money {
    return new Money(this.amount.abs(), this.currency);
  }

  // ─── Redondeo / salida ──────────────────────────────────────────────────────

  /** Redondea a la escala de la moneda con la política central (HALF_UP). */
  round(): Money {
    const scale = getCurrencyScale(this.currency);
    return new Money(
      this.amount.toDecimalPlaces(scale, MONEY_ROUNDING),
      this.currency,
    );
  }

  /** String de escala fija para persistir en columnas NUMERIC (ej. "1234.56"). */
  toString(): string {
    const scale = getCurrencyScale(this.currency);
    return this.amount.toFixed(scale, MONEY_ROUNDING);
  }

  /** Entero en unidad mínima (centavos) — para procesadores de pago. Exacto. */
  toMinorUnits(): number {
    const scale = getCurrencyScale(this.currency);
    return this.amount
      .times(new MoneyDecimal(10).pow(scale))
      .toDecimalPlaces(0, MONEY_ROUNDING)
      .toNumber();
  }

  /**
   * Número JS en unidades mayores. Es una conversión CON PÉRDIDA (float): usar
   * solo en bordes legacy/serialización a clientes que esperan number. Nunca
   * para volver a hacer aritmética monetaria.
   */
  toNumber(): number {
    return this.round().amount.toNumber();
  }

  /** Acceso al Decimal interno (sin redondear) para casos avanzados. */
  toDecimal(): MoneyDecimalInstance {
    return this.amount;
  }

  // ─── Comparadores ────────────────────────────────────────────────────────────

  equals(other: Money): boolean {
    return this.currency === other.currency && this.amount.equals(other.amount);
  }

  greaterThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThan(other.amount);
  }

  greaterThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.greaterThanOrEqualTo(other.amount);
  }

  lessThan(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThan(other.amount);
  }

  lessThanOrEqual(other: Money): boolean {
    this.assertSameCurrency(other);
    return this.amount.lessThanOrEqualTo(other.amount);
  }

  isZero(): boolean {
    return this.amount.isZero();
  }

  isNegative(): boolean {
    return this.amount.isNegative() && !this.amount.isZero();
  }

  isPositive(): boolean {
    return this.amount.isPositive() && !this.amount.isZero();
  }

  // ─── Internos ────────────────────────────────────────────────────────────────

  private assertSameCurrency(other: Money): void {
    if (this.currency !== other.currency) {
      throw new Error(
        `No se pueden operar montos de distinta moneda: ${this.currency} vs ${other.currency}`,
      );
    }
  }
}
