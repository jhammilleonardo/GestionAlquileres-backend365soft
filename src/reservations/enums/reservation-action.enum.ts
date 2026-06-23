import { ReservationStatus } from './reservation-status.enum';

/**
 * Acciones de gestión que un admin/empleado puede ejecutar sobre una reserva.
 * Cada acción es una transición válida de la máquina de estados (ver
 * RESERVATION_TRANSITIONS). Se modela por acción (no por estado destino directo)
 * para validar el origen permitido y dar errores accionables.
 */
export enum ReservationAction {
  CONFIRM = 'confirm',
  DECLINE = 'decline',
  CANCEL = 'cancel',
  CHECK_IN = 'check_in',
  NO_SHOW = 'no_show',
  COMPLETE = 'complete',
}

export interface ReservationTransition {
  /** Estados desde los que la acción es válida. */
  from: readonly ReservationStatus[];
  /** Estado resultante. */
  to: ReservationStatus;
  /** Si true, libera las noches ocupadas (vuelven a `available`). */
  releasesAvailability: boolean;
}

/**
 * Máquina de estados de reservas (fuente única de verdad para las transiciones).
 *
 *  PENDING ──confirm──▶ CONFIRMED ──check_in──▶ IN_PROGRESS ──complete──▶ COMPLETED
 *    │ decline             │ no_show / cancel
 *    ▼                     ▼
 *  DECLINED            NO_SHOW / CANCELLED
 *
 * Las transiciones a estados no-ocupantes (DECLINED/CANCELLED/NO_SHOW) liberan
 * las noches para que la unidad vuelva a ser reservable.
 */
export const RESERVATION_TRANSITIONS: Readonly<
  Record<ReservationAction, ReservationTransition>
> = {
  [ReservationAction.CONFIRM]: {
    from: [ReservationStatus.PENDING],
    to: ReservationStatus.CONFIRMED,
    releasesAvailability: false,
  },
  [ReservationAction.DECLINE]: {
    from: [ReservationStatus.PENDING],
    to: ReservationStatus.DECLINED,
    releasesAvailability: true,
  },
  [ReservationAction.CANCEL]: {
    from: [
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.PENDING,
      ReservationStatus.CONFIRMED,
    ],
    to: ReservationStatus.CANCELLED,
    releasesAvailability: true,
  },
  [ReservationAction.CHECK_IN]: {
    from: [ReservationStatus.CONFIRMED],
    to: ReservationStatus.IN_PROGRESS,
    releasesAvailability: false,
  },
  [ReservationAction.NO_SHOW]: {
    from: [ReservationStatus.CONFIRMED],
    to: ReservationStatus.NO_SHOW,
    releasesAvailability: true,
  },
  [ReservationAction.COMPLETE]: {
    from: [ReservationStatus.IN_PROGRESS],
    to: ReservationStatus.COMPLETED,
    releasesAvailability: false,
  },
};
