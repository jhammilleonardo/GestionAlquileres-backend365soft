/**
 * Payment Processor Enum
 *
 * Procesadores de pago soportados para integración.
 */
export enum PaymentProcessor {
  /** Stripe - procesador global */
  STRIPE = 'stripe',

  /** PayPal - procesador global */
  PAYPAL = 'paypal',

  /** Square - procesador USA */
  SQUARE = 'square',

  /** Authorize.Net - procesador USA */
  AUTHORIZE_NET = 'authorize_net',

  /** Plaid - para ACH en USA */
  PLAID = 'plaid',

  /** Dwolla - para ACH en USA */
  DWOLLA = 'dwolla',

  /** Mercado Pago - Latinoamérica */
  MERCADO_PAGO = 'mercado_pago',

  /** Manual - registro manual sin procesador */
  MANUAL = 'manual'
}

/**
 * Nombres de procesadores
 */
export const PaymentProcessorLabels: Record<PaymentProcessor, string> = {
  [PaymentProcessor.STRIPE]: 'Stripe',
  [PaymentProcessor.PAYPAL]: 'PayPal',
  [PaymentProcessor.SQUARE]: 'Square',
  [PaymentProcessor.AUTHORIZE_NET]: 'Authorize.Net',
  [PaymentProcessor.PLAID]: 'Plaid',
  [PaymentProcessor.DWOLLA]: 'Dwolla',
  [PaymentProcessor.MERCADO_PAGO]: 'Mercado Pago',
  [PaymentProcessor.MANUAL]: 'Manual'
};
