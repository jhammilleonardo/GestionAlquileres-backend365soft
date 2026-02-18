/**
 * Currency Enum
 *
 * Monedas soportadas según código ISO 4217.
 * Incluye monedas de USA, Europa y Latinoamérica.
 */
export enum Currency {
  /** Dólar estadounidense */
  USD = 'USD',

  /** Euro */
  EUR = 'EUR',

  /** Libra esterlina */
  GBP = 'GBP',

  /** Dólar canadiense */
  CAD = 'CAD',

  /** Peso mexicano */
  MXN = 'MXN',

  /** Dólar australiano */
  AUD = 'AUD',

  /** Real brasileño */
  BRL = 'BRL',

  /** Peso colombiano */
  COP = 'COP',

  /** Peso chileno */
  CLP = 'CLP',

  /** Sol peruano */
  PEN = 'PEN',

  /** Peso argentino */
  ARS = 'ARS',

  /** Boliviano */
  BOB = 'BOB'
}

/**
 * Símbolos de moneda
 */
export const CurrencySymbols: Record<Currency, string> = {
  [Currency.USD]: '$',
  [Currency.EUR]: '€',
  [Currency.GBP]: '£',
  [Currency.CAD]: 'CA$',
  [Currency.MXN]: 'MX$',
  [Currency.AUD]: 'A$',
  [Currency.BRL]: 'R$',
  [Currency.COP]: 'COL$',
  [Currency.CLP]: 'CL$',
  [Currency.PEN]: 'S/',
  [Currency.ARS]: 'AR$',
  [Currency.BOB]: 'Bs'
};

/**
 * Nombres completos de monedas
 */
export const CurrencyNames: Record<Currency, string> = {
  [Currency.USD]: 'Dólar Estadounidense',
  [Currency.EUR]: 'Euro',
  [Currency.GBP]: 'Libra Esterlina',
  [Currency.CAD]: 'Dólar Canadiense',
  [Currency.MXN]: 'Peso Mexicano',
  [Currency.AUD]: 'Dólar Australiano',
  [Currency.BRL]: 'Real Brasileño',
  [Currency.COP]: 'Peso Colombiano',
  [Currency.CLP]: 'Peso Chileno',
  [Currency.PEN]: 'Sol Peruano',
  [Currency.ARS]: 'Peso Argentino',
  [Currency.BOB]: 'Boliviano'
};
