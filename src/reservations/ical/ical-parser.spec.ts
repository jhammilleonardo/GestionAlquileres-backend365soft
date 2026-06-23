import { parseIcalendar } from './ical-parser';

const ICS = [
  'BEGIN:VCALENDAR',
  'VERSION:2.0',
  'BEGIN:VEVENT',
  'UID:a@x',
  'DTSTART;VALUE=DATE:20260610',
  'DTEND;VALUE=DATE:20260615',
  'SUMMARY:Reserved',
  'END:VEVENT',
  'BEGIN:VEVENT',
  'UID:b@x',
  'DTSTART;VALUE=DATE:20260701',
  'DTEND;VALUE=DATE:20260702',
  'END:VEVENT',
  'END:VCALENDAR',
].join('\r\n');

describe('parseIcalendar', () => {
  it('extrae los rangos ocupados de los VEVENT', () => {
    const ranges = parseIcalendar(ICS);
    expect(ranges).toEqual([
      { start: '2026-06-10', end: '2026-06-15' },
      { start: '2026-07-01', end: '2026-07-02' },
    ]);
  });

  it('asume una noche si falta DTEND', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART;VALUE=DATE:20260610',
      'END:VEVENT',
    ].join('\n');
    expect(parseIcalendar(ics)).toEqual([
      { start: '2026-06-10', end: '2026-06-11' },
    ]);
  });

  it('soporta DATE-TIME tomando sólo la fecha', () => {
    const ics = [
      'BEGIN:VEVENT',
      'DTSTART:20260610T140000Z',
      'DTEND:20260612T100000Z',
      'END:VEVENT',
    ].join('\n');
    expect(parseIcalendar(ics)).toEqual([
      { start: '2026-06-10', end: '2026-06-12' },
    ]);
  });

  it('ignora contenido fuera de VEVENT y devuelve [] si no hay eventos', () => {
    expect(parseIcalendar('BEGIN:VCALENDAR\r\nEND:VCALENDAR')).toEqual([]);
  });
});
