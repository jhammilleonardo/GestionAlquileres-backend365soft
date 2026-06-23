/**
 * Ciclo de vida de una reserva de corto plazo.
 *
 * Flujo feliz:  PENDING_PAYMENT → CONFIRMED → IN_PROGRESS → COMPLETED
 *                PENDING → CONFIRMED → IN_PROGRESS → COMPLETED
 * Terminales negativos: CANCELLED, EXPIRED, NO_SHOW, DECLINED
 *
 *  - PENDING     reserva creada en modo request-to-book; espera aprobación (expires_at).
 *  - CONFIRMED   reserva aceptada (instant-book o aprobada); ocupa la unidad.
 *  - IN_PROGRESS el huésped está hospedado (entre check-in y check-out); ocupa la unidad.
 *  - COMPLETED   estadía finalizada con éxito.
 *  - CANCELLED   cancelada por el inquilino/admin antes del check-in.
 *  - EXPIRED     PENDING que no se aprobó/pagó antes de `expires_at`.
 *  - NO_SHOW     confirmada pero el huésped no se presentó.
 *  - DECLINED    el admin rechazó una solicitud PENDING.
 */
export enum ReservationStatus {
  PENDING_PAYMENT = 'pending_payment',
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  EXPIRED = 'expired',
  NO_SHOW = 'no_show',
  DECLINED = 'declined',
}

/**
 * Estados que **ocupan** la unidad y por tanto deben impedir solapes
 * (anti doble-booking). Fuente única de verdad para la app y para la
 * exclusion constraint del provisioning.
 *
 * `COMPLETED` no se incluye: su rango de fechas siempre queda en el pasado,
 * por lo que no puede solapar con una reserva futura.
 */
export const OCCUPYING_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.PENDING_PAYMENT,
  ReservationStatus.PENDING,
  ReservationStatus.CONFIRMED,
  ReservationStatus.IN_PROGRESS,
];

/**
 * Estados terminales: la reserva ya no transita a otro estado.
 */
export const TERMINAL_RESERVATION_STATUSES: readonly ReservationStatus[] = [
  ReservationStatus.COMPLETED,
  ReservationStatus.CANCELLED,
  ReservationStatus.EXPIRED,
  ReservationStatus.NO_SHOW,
  ReservationStatus.DECLINED,
];
