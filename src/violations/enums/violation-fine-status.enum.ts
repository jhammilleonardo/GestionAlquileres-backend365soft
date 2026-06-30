export enum ViolationFineStatusEnum {
  /** Sin multa asociada. */
  NONE = 'none',
  /** Multa aplicada, pendiente de pago. */
  CHARGED = 'charged',
  /** Multa pagada por el inquilino. */
  PAID = 'paid',
  /** Multa condonada por el administrador. */
  WAIVED = 'waived',
}
