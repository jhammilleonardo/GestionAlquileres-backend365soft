/**
 * Payment Status Enum
 *
 * Estados del ciclo de vida de un pago.
 */
export enum PaymentStatus {
  /** Pendiente de aprobación/procesamiento */
  PENDING = 'PENDING',

  /** Siendo procesado por el procesador de pagos */
  PROCESSING = 'PROCESSING',

  /** Aprobado y completado */
  APPROVED = 'APPROVED',

  /** Rechazado por el administrador */
  REJECTED = 'REJECTED',

  /** Falló el procesamiento (error del procesador) */
  FAILED = 'FAILED',

  /** Reembolsado completamente */
  REFUNDED = 'REFUNDED',

  /** Revertido (cancelado) */
  REVERSED = 'REVERSED',

  /** En disputa (chargeback) */
  DISPUTED = 'DISPUTED'
}

/**
 * Etiquetas en español para los estados
 */
export const PaymentStatusLabels: Record<PaymentStatus, string> = {
  [PaymentStatus.PENDING]: 'Pendiente',
  [PaymentStatus.PROCESSING]: 'Procesando',
  [PaymentStatus.APPROVED]: 'Aprobado',
  [PaymentStatus.REJECTED]: 'Rechazado',
  [PaymentStatus.FAILED]: 'Fallido',
  [PaymentStatus.REFUNDED]: 'Reembolsado',
  [PaymentStatus.REVERSED]: 'Revertido',
  [PaymentStatus.DISPUTED]: 'En Disputa'
};
