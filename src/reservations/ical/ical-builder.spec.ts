import { buildIcalendar, IcalEvent } from './ical-builder';

const OPTS = {
  prodId: '-//Test//EN',
  calendarName: 'Unit A1',
  dtstamp: '20260613T000000Z',
};

describe('buildIcalendar', () => {
  it('genera un documento VCALENDAR con CRLF y cabeceras', () => {
    const ics = buildIcalendar([], OPTS);

    expect(ics.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('PRODID:-//Test//EN');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });

  it('emite un VEVENT all-day por cada evento', () => {
    const events: IcalEvent[] = [
      {
        uid: 'reservation-5@365soft',
        start: '20260610',
        end: '20260615',
        summary: 'Reserved',
      },
    ];
    const ics = buildIcalendar(events, OPTS);

    expect(ics).toContain('BEGIN:VEVENT');
    expect(ics).toContain('UID:reservation-5@365soft');
    expect(ics).toContain('DTSTART;VALUE=DATE:20260610');
    expect(ics).toContain('DTEND;VALUE=DATE:20260615');
    expect(ics).toContain('SUMMARY:Reserved');
  });

  it('escapa los caracteres especiales del resumen', () => {
    const ics = buildIcalendar(
      [{ uid: 'x', start: '20260101', end: '20260102', summary: 'a; b, c' }],
      OPTS,
    );
    expect(ics).toContain('SUMMARY:a\\; b\\, c');
  });
});
