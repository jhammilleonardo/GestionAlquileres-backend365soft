/**
 * Parser de iCalendar (RFC 5545) — función pura, sin red ni efectos. Extrae los
 * rangos de fechas ocupadas (VEVENT) de un texto `.ics` para importarlos como
 * bloqueos. Tolera CRLF/LF y el "line folding" (líneas continuadas que empiezan
 * con espacio o tab). Soporta DTSTART/DTEND en formato DATE (YYYYMMDD) y
 * DATE-TIME (YYYYMMDDTHHMMSS[Z]); de este último toma sólo la fecha.
 */

export interface BusyRange {
  /** Inicio inclusivo, YYYY-MM-DD. */
  start: string;
  /** Fin EXCLUSIVO, YYYY-MM-DD (estilo check-out). */
  end: string;
}

/** Desdobla líneas continuadas (folding) y normaliza saltos de línea. */
function unfold(text: string): string[] {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\n[ \t]/g, '')
    .split('\n');
}

/** 'YYYYMMDD' o 'YYYYMMDDT...' → 'YYYY-MM-DD'; null si no es válido. */
function toIsoDate(value: string): string | null {
  const match = /^(\d{4})(\d{2})(\d{2})/.exec(value.trim());
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Toma el valor de una línea tipo `DTSTART;VALUE=DATE:20260610`. */
function lineValue(line: string): string {
  const colon = line.indexOf(':');
  return colon === -1 ? '' : line.slice(colon + 1);
}

export function parseIcalendar(text: string): BusyRange[] {
  const ranges: BusyRange[] = [];
  let inEvent = false;
  let start: string | null = null;
  let end: string | null = null;

  for (const rawLine of unfold(text)) {
    const line = rawLine.trim();
    if (line === 'BEGIN:VEVENT') {
      inEvent = true;
      start = null;
      end = null;
      continue;
    }
    if (line === 'END:VEVENT') {
      if (start) {
        // Si no hay DTEND, una sola noche: fin = inicio + 1 día.
        ranges.push({ start, end: end ?? addOneDay(start) });
      }
      inEvent = false;
      continue;
    }
    if (!inEvent) continue;

    if (line.startsWith('DTSTART')) {
      start = toIsoDate(lineValue(line));
    } else if (line.startsWith('DTEND')) {
      end = toIsoDate(lineValue(line));
    }
  }

  return ranges;
}

function addOneDay(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}
