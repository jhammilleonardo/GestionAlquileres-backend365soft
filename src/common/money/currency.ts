/**
 * Registro de monedas con su exponente de unidad mínima (cuántos decimales
 * tiene la moneda). Es la fuente de verdad para redondear y para convertir a
 * unidad mínima (centavos) al hablar con procesadores de pago.
 *
 * Hoy el producto opera en USD/BOB/GTQ/HNL (todas de 2 decimales), pero el
 * diseño soporta monedas de 0 o 3 decimales (p. ej. JPY=0, KWD=3) sin tocar el
 * resto del sistema.
 */
const CURRENCY_SCALE: Readonly<Record<string, number>> = {
  USD: 2,
  BOB: 2,
  GTQ: 2,
  HNL: 2,
  EUR: 2,
  MXN: 2,
  // Ejemplos de otras escalas para dejar claro que es configurable:
  JPY: 0,
  CLP: 0,
  KWD: 3,
};

/** Escala por defecto cuando la moneda no está en el registro. */
const DEFAULT_SCALE = 2;

/** Normaliza un código de moneda a su forma canónica (3 letras, mayúsculas). */
export function normalizeCurrency(code: string): string {
  return code.trim().toUpperCase();
}

/**
 * Decimales de la unidad mínima de la moneda. Si la moneda es desconocida,
 * asume 2 (caso más común) en vez de fallar, para no romper flujos existentes.
 */
export function getCurrencyScale(code: string): number {
  return CURRENCY_SCALE[normalizeCurrency(code)] ?? DEFAULT_SCALE;
}

/** Factor de la unidad mínima: 10^escala (100 para 2 decimales). */
export function getMinorUnitFactor(code: string): number {
  return 10 ** getCurrencyScale(code);
}
