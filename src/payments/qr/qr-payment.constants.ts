/**
 * Estados del QR (equivalente al modelo Qr de Laravel).
 */
export const QR_ESTADO = {
  PENDIENTE: 'PENDIENTE',
  PAGADO: 'PAGADO',
  CANCELADO: 'CANCELADO',
  VENCIDO: 'VENCIDO',
} as const;

export type QrEstado = (typeof QR_ESTADO)[keyof typeof QR_ESTADO];
