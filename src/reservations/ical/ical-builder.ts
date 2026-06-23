/**
 * Generación de iCalendar (RFC 5545) — función pura, sin BD ni efectos. Toma
 * eventos de fechas ocupadas y produce el texto `.ics`. Testeable en aislamiento
 * y reutilizable por cualquier exportación de calendario.
 */

export interface IcalEvent {
  /** Identificador único y estable del evento. */
  uid: string;
  /** Fecha de inicio en formato YYYYMMDD (all-day). */
  start: string;
  /** Fecha de fin EXCLUSIVA en formato YYYYMMDD (all-day, estilo check-out). */
  end: string;
  summary: string;
}

const CRLF = '\r\n';

/** Escapa los caracteres especiales de un valor de texto iCal (RFC 5545 §3.3.11). */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function buildEvent(event: IcalEvent, dtstamp: string): string {
  return [
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;VALUE=DATE:${event.start}`,
    `DTEND;VALUE=DATE:${event.end}`,
    `SUMMARY:${escapeText(event.summary)}`,
    'END:VEVENT',
  ].join(CRLF);
}

/**
 * Construye un documento iCalendar completo. `dtstamp` debe ser UTC en formato
 * `YYYYMMDDTHHMMSSZ`; se inyecta para que la salida sea determinista en tests.
 */
export function buildIcalendar(
  events: IcalEvent[],
  options: { prodId: string; calendarName: string; dtstamp: string },
): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    `PRODID:${options.prodId}`,
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeText(options.calendarName)}`,
    ...events.map((event) => buildEvent(event, options.dtstamp)),
    'END:VCALENDAR',
  ];
  // RFC 5545 exige CRLF entre líneas y un CRLF final.
  return lines.join(CRLF) + CRLF;
}
