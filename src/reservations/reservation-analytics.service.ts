import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { MoneyDecimal, MONEY_ROUNDING } from '../common/money';

export interface ReservationAnalytics {
  from: string;
  to: string;
  range_nights: number;
  short_term_units: number;
  available_nights: number;
  booked_nights: number;
  /** Ocupación 0–1 (noches reservadas / capacidad). */
  occupancy_rate: number;
  revenue: number;
  currency: string;
  /** Tarifa media por noche reservada (revenue / booked_nights). */
  adr: number;
  reservations_by_status: Record<string, number>;
}

/** Estados de reserva que cuentan como ingreso. */
const REVENUE_STATUSES = ['confirmed', 'in_progress', 'completed'];

const MS_PER_DAY = 1000 * 60 * 60 * 24;

/**
 * Métricas de ocupación e ingresos de corto plazo (solo lectura). Las consultas
 * usan nombres de tabla sin calificar: corren dentro del request con el
 * `search_path` del tenant ya fijado por el middleware.
 */
@Injectable()
export class ReservationAnalyticsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getOverview(query: AnalyticsQueryDto): Promise<ReservationAnalytics> {
    const rangeNights = this.rangeNights(query.from, query.to);

    const [units, booked, revenue, byStatus] = await Promise.all([
      this.countShortTermUnits(),
      this.countBookedNights(query.from, query.to),
      this.sumRevenue(query.from, query.to),
      this.countByStatus(query.from, query.to),
    ]);

    const availableNights = units * rangeNights;
    const occupancyRate =
      availableNights > 0 ? this.round4(booked / availableNights) : 0;
    const adr = booked > 0 ? this.round2(revenue.amount / booked) : 0;

    return {
      from: query.from,
      to: query.to,
      range_nights: rangeNights,
      short_term_units: units,
      available_nights: availableNights,
      booked_nights: booked,
      occupancy_rate: occupancyRate,
      revenue: this.round2(revenue.amount),
      currency: revenue.currency,
      adr,
      reservations_by_status: byStatus,
    };
  }

  private rangeNights(from: string, to: string): number {
    const start = new Date(from);
    const end = new Date(to);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      throw new BadRequestException('Rango de fechas inválido');
    }
    // Noches inclusivas entre ambas fechas (mínimo 1).
    const nights =
      Math.round((end.getTime() - start.getTime()) / MS_PER_DAY) + 1;
    if (nights <= 0) {
      throw new BadRequestException(
        'La fecha "to" debe ser posterior a "from"',
      );
    }
    return nights;
  }

  private async countShortTermUnits(): Promise<number> {
    const rows = await this.dataSource.query<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM units
        WHERE rental_type IN ('SHORT_TERM', 'BOTH')`,
    );
    return rows[0]?.count ?? 0;
  }

  private async countBookedNights(from: string, to: string): Promise<number> {
    const rows = await this.dataSource.query<Array<{ count: number }>>(
      `SELECT COUNT(*)::int AS count FROM property_availability
        WHERE status = 'booked' AND date BETWEEN $1 AND $2`,
      [from, to],
    );
    return rows[0]?.count ?? 0;
  }

  private async sumRevenue(
    from: string,
    to: string,
  ): Promise<{ amount: number; currency: string }> {
    const rows = await this.dataSource.query<
      Array<{ amount: number; currency: string | null }>
    >(
      `SELECT COALESCE(SUM(total_amount), 0)::float8 AS amount,
              (SELECT currency FROM tenant_config LIMIT 1) AS currency
         FROM reservations
        WHERE status = ANY($1::text[])
          AND checkin_date BETWEEN $2 AND $3`,
      [REVENUE_STATUSES, from, to],
    );
    return {
      amount: rows[0]?.amount ?? 0,
      currency: rows[0]?.currency ?? 'BOB',
    };
  }

  private async countByStatus(
    from: string,
    to: string,
  ): Promise<Record<string, number>> {
    const rows = await this.dataSource.query<
      Array<{ status: string; count: number }>
    >(
      `SELECT status, COUNT(*)::int AS count FROM reservations
        WHERE checkin_date BETWEEN $1 AND $2
        GROUP BY status`,
      [from, to],
    );
    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.status] = row.count;
      return acc;
    }, {});
  }

  private round2(value: number): number {
    return new MoneyDecimal(value)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
  }

  private round4(value: number): number {
    return Math.round((value + Number.EPSILON) * 10000) / 10000;
  }
}
