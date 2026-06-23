import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { OCCUPYING_RESERVATION_STATUSES } from '../enums/reservation-status.enum';
import { buildIcalendar, IcalEvent } from './ical-builder';

const PROD_ID = '-//365Soft//Reservations//EN';

interface ReservationDateRow {
  id: number;
  checkin: string;
  checkout: string;
}

interface BlockedDateRow {
  start: string;
  end: string;
}

/**
 * Exporta el calendario de ocupación de una unidad como iCalendar (.ics): un
 * evento por reserva ocupante y uno por fecha bloqueada. No expone datos del
 * huésped — sólo rangos ocupados — para poder sincronizarlo con herramientas
 * externas sin filtrar PII.
 */
@Injectable()
export class IcalService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async buildUnitCalendar(unitId: number): Promise<string> {
    const unit = await this.dataSource.query<Array<{ unit_number: string }>>(
      `SELECT unit_number FROM units WHERE id = $1`,
      [unitId],
    );
    if (unit.length === 0) {
      throw new NotFoundException(`Unidad ${unitId} no encontrada`);
    }

    const [reservations, blocked] = await Promise.all([
      this.dataSource.query<ReservationDateRow[]>(
        `SELECT id, checkin_date::text AS checkin, checkout_date::text AS checkout
           FROM reservations
          WHERE unit_id = $1 AND status = ANY($2::text[])`,
        [unitId, OCCUPYING_RESERVATION_STATUSES],
      ),
      this.dataSource.query<BlockedDateRow[]>(
        `SELECT date::text AS start, (date + 1)::date::text AS "end"
           FROM property_availability
          WHERE unit_id = $1 AND status = 'blocked'`,
        [unitId],
      ),
    ]);

    const events: IcalEvent[] = [
      ...reservations.map((row) => ({
        uid: `reservation-${row.id}@365soft`,
        start: this.toIcalDate(row.checkin),
        end: this.toIcalDate(row.checkout),
        summary: 'Reserved',
      })),
      ...blocked.map((row) => ({
        uid: `block-${unitId}-${row.start}@365soft`,
        start: this.toIcalDate(row.start),
        end: this.toIcalDate(row.end),
        summary: 'Blocked',
      })),
    ];

    return buildIcalendar(events, {
      prodId: PROD_ID,
      calendarName: `Unit ${unit[0].unit_number}`,
      dtstamp: this.nowDtstamp(),
    });
  }

  /** 'YYYY-MM-DD' → 'YYYYMMDD' (formato DATE de iCal). */
  private toIcalDate(value: string): string {
    return value.slice(0, 10).replace(/-/g, '');
  }

  private nowDtstamp(): string {
    return new Date()
      .toISOString()
      .replace(/[-:]/g, '')
      .replace(/\.\d{3}/, '');
  }
}
