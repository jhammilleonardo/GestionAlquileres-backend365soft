/**
 * Payment Method Enum
 *
 * Métodos de pago soportados internacionalmente.
 * Incluye métodos específicos de USA, Europa y Latinoamérica.
 */
export enum PaymentMethod {
  /** ACH - Automated Clearing House (USA) */
  ACH = 'ACH',

  /** Tarjeta de crédito */
  CREDIT_CARD = 'CREDIT_CARD',

  /** Tarjeta de débito */
  DEBIT_CARD = 'DEBIT_CARD',

  /** Cheque electrónico */
  ECHECK = 'ECHECK',

  /** Efectivo */
  CASH = 'CASH',

  /** Giro postal/Money Order */
  MONEY_ORDER = 'MONEY_ORDER',

  /** Cheque físico */
  CHECK = 'CHECK',

  /** Transferencia bancaria/Wire Transfer */
  WIRE_TRANSFER = 'WIRE_TRANSFER',

  /** PayPal */
  PAYPAL = 'PAYPAL',

  /** Stripe */
  STRIPE = 'STRIPE',

  /** Zelle (popular en USA) */
  ZELLE = 'ZELLE',

  /** Venmo (popular en USA) */
  VENMO = 'VENMO',

  /** SEPA - Single Euro Payments Area (Europa) */
  SEPA = 'SEPA',

  /** Transferencia bancaria genérica */
  TRANSFER = 'TRANSFER',

  /** Otros métodos */
  OTHER = 'OTHER'
}

/**
 * Etiquetas en español para los métodos de pago
 */
export const PaymentMethodLabels: Record<PaymentMethod, string> = {
  [PaymentMethod.ACH]: 'ACH (Transferencia Automática USA)',
  [PaymentMethod.CREDIT_CARD]: 'Tarjeta de Crédito',
  [PaymentMethod.DEBIT_CARD]: 'Tarjeta de Débito',
  [PaymentMethod.ECHECK]: 'Cheque Electrónico',
  [PaymentMethod.CASH]: 'Efectivo',
  [PaymentMethod.MONEY_ORDER]: 'Giro Postal',
  [PaymentMethod.CHECK]: 'Cheque',
  [PaymentMethod.WIRE_TRANSFER]: 'Transferencia Bancaria',
  [PaymentMethod.PAYPAL]: 'PayPal',
  [PaymentMethod.STRIPE]: 'Stripe',
  [PaymentMethod.ZELLE]: 'Zelle',
  [PaymentMethod.VENMO]: 'Venmo',
  [PaymentMethod.SEPA]: 'SEPA (Europa)',
  [PaymentMethod.TRANSFER]: 'Transferencia Bancaria',
  [PaymentMethod.OTHER]: 'Otro'
};
