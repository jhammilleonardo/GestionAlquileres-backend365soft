/**
 * Payment Type Enum
 *
 * Define los tipos de pagos soportados en el sistema.
 * Basado en Buildium y prácticas internacionales.
 */
export enum PaymentType {
  /** Pago de renta mensual */
  RENT = 'RENT',

  /** Depósito de seguridad */
  DEPOSIT = 'DEPOSIT',

  /** Cargo por pago tardío */
  LATE_FEE = 'LATE_FEE',

  /** Servicios públicos (agua, luz, gas) */
  UTILITY = 'UTILITY',

  /** Cuota de asociación de propietarios (HOA) */
  HOA_FEE = 'HOA_FEE',

  /** Cargo por mascotas */
  PET_FEE = 'PET_FEE',

  /** Cargo por estacionamiento */
  PARKING_FEE = 'PARKING_FEE',

  /** Tarifa de solicitud de arriendo */
  APPLICATION_FEE = 'APPLICATION_FEE',

  /** Cargo por mantenimiento */
  MAINTENANCE_FEE = 'MAINTENANCE_FEE',

  /** Otros cargos */
  OTHER = 'OTHER'
}

/**
 * Etiquetas en español para los tipos de pago
 */
export const PaymentTypeLabels: Record<PaymentType, string> = {
  [PaymentType.RENT]: 'Renta',
  [PaymentType.DEPOSIT]: 'Depósito de Seguridad',
  [PaymentType.LATE_FEE]: 'Cargo por Retraso',
  [PaymentType.UTILITY]: 'Servicios Públicos',
  [PaymentType.HOA_FEE]: 'Cuota HOA',
  [PaymentType.PET_FEE]: 'Cargo por Mascota',
  [PaymentType.PARKING_FEE]: 'Estacionamiento',
  [PaymentType.APPLICATION_FEE]: 'Tarifa de Solicitud',
  [PaymentType.MAINTENANCE_FEE]: 'Mantenimiento',
  [PaymentType.OTHER]: 'Otro'
};
