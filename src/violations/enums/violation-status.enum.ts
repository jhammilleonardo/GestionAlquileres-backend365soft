export enum ViolationStatusEnum {
  /** Registrada, sin aviso formal todavía. */
  OPEN = 'open',
  /** Aviso formal enviado al inquilino. */
  NOTIFIED = 'notified',
  /** El inquilino está corrigiendo la infracción. */
  IN_PROGRESS = 'in_progress',
  /** Venció el plazo o reincidencia: escalada (multa/acción legal). */
  ESCALATED = 'escalated',
  /** Corregida y cerrada. */
  RESOLVED = 'resolved',
  /** Desestimada (falsa alarma o sin mérito). */
  DISMISSED = 'dismissed',
}

/** Estados que cuentan como cerrados (no requieren acción). */
export const CLOSED_VIOLATION_STATUSES: readonly ViolationStatusEnum[] = [
  ViolationStatusEnum.RESOLVED,
  ViolationStatusEnum.DISMISSED,
];
