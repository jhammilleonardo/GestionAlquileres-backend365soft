import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { priceReservation, PriceLine } from './reservation-pricing';
import { resolveStayPricing, SeasonRule } from './season-pricing';

/** Línea del desglose (alias de la línea de pricing compartida). */
export type QuoteLine = PriceLine;

export interface QuoteBreakdown {
  property_id: number;
  unit_id: number;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  price_per_night: number;
  currency: string;
  lines: QuoteLine[];
  subtotal: number;
  discount_total: number;
  tax_total: number;
  total: number;
  /** Depósito de garantía reembolsable. */
  deposit: number;
  /** Lo que el huésped paga: total del alojamiento + depósito. */
  total_due: number;
  /**
   * Adelanto necesario para confirmar la reserva. Igual a `total_due` si la
   * unidad exige el pago completo; menor si define un % de adelanto.
   */
  deposit_to_confirm: number;
}

interface UnitPricingRow {
  property_id: string;
  rental_type: string;
  price_per_night: string | null;
  cleaning_fee: string | null;
  min_nights: string | null;
  max_nights: string | null;
  weekly_discount_pct: string | null;
  monthly_discount_pct: string | null;
  weekend_adjustment_pct: string | null;
  early_bird_min_days: string | null;
  early_bird_discount_pct: string | null;
  last_minute_max_days: string | null;
  last_minute_adjustment_pct: string | null;
  advance_notice_days: string | null;
  max_advance_days: string | null;
  currency: string | null;
  tenant_rental_type: string | null;
  occupancy_tax_pct: string | null;
  deposit_amount: string | null;
  deposit_to_confirm_pct: string | null;
}

/**
 * Motor de cotización de reservas. Calcula el desglose de precio (base, descuento
 * por estadía, limpieza, total) sin crear nada. Diseñado abierto/cerrado: añadir
 * un nuevo concepto = agregar una `QuoteLine`, sin tocar el cálculo existente.
 */
@Injectable()
export class QuoteService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getQuote(
    propertyId: number,
    unitId: number,
    dto: QuoteRequestDto,
  ): Promise<QuoteBreakdown> {
    const checkin = new Date(dto.checkin_date);
    const checkout = new Date(dto.checkout_date);
    this.assertDatesOrder(checkin, checkout);

    const unit = await this.findUnitPricing(propertyId, unitId);
    this.assertUnitIsShortTerm(unit);

    const nights = this.calculateNights(checkin, checkout);
    const pricePerNight = this.toNumber(unit.price_per_night);
    const currency = unit.currency ?? 'BOB';

    // Resuelve precio por noche y noches mínimas según temporada (si la hay).
    const baseMinNights = unit.min_nights ? parseInt(unit.min_nights, 10) : 1;
    const seasons = await this.findSeasons(unitId);
    const stay = resolveStayPricing(
      dto.checkin_date,
      nights,
      pricePerNight,
      baseMinNights,
      seasons,
    );

    this.assertNightsInRange(nights, stay.effectiveMinNights, unit);
    const leadTimeDays = this.daysUntil(dto.checkin_date);
    this.assertBookingWindow(leadTimeDays, unit);
    await this.assertAvailable(unitId, dto.checkin_date, dto.checkout_date);

    // Cálculo delegado a la función pura compartida (misma usada al crear la
    // reserva): garantiza que el precio mostrado = el precio cobrado.
    const pricing = priceReservation({
      pricePerNight,
      nights,
      nightlyPrices: stay.nightlyPrices,
      nightlyDates: stay.nightlyDates,
      cleaningFee: this.toNumber(unit.cleaning_fee),
      weeklyDiscountPct: this.toNumber(unit.weekly_discount_pct),
      monthlyDiscountPct: this.toNumber(unit.monthly_discount_pct),
      occupancyTaxPct: this.toNumber(unit.occupancy_tax_pct),
      securityDeposit: this.toNumber(unit.deposit_amount),
      weekendAdjustmentPct: this.toNumber(unit.weekend_adjustment_pct),
      leadTimeDays,
      earlyBirdMinDays: this.toOptionalInt(unit.early_bird_min_days),
      earlyBirdDiscountPct: this.toNumber(unit.early_bird_discount_pct),
      lastMinuteMaxDays: this.toOptionalInt(unit.last_minute_max_days),
      lastMinuteAdjustmentPct: this.toNumber(unit.last_minute_adjustment_pct),
    });

    // Adelanto para confirmar: % del total si la unidad lo define (0 < pct < 100);
    // si no, el total completo.
    const depositPct =
      unit.deposit_to_confirm_pct != null
        ? Number(unit.deposit_to_confirm_pct)
        : null;
    const depositToConfirm =
      depositPct != null && depositPct > 0 && depositPct < 100
        ? Math.round(pricing.totalDue * depositPct) / 100
        : pricing.totalDue;

    return {
      property_id: propertyId,
      unit_id: unitId,
      checkin_date: dto.checkin_date,
      checkout_date: dto.checkout_date,
      nights,
      price_per_night: pricePerNight,
      currency,
      lines: pricing.lines,
      subtotal: pricing.subtotal,
      discount_total: pricing.discountTotal,
      tax_total: pricing.taxTotal,
      total: pricing.total,
      deposit: pricing.deposit,
      total_due: pricing.totalDue,
      deposit_to_confirm: depositToConfirm,
    };
  }

  private async findUnitPricing(
    propertyId: number,
    unitId: number,
  ): Promise<UnitPricingRow> {
    const rows: UnitPricingRow[] = await this.dataSource.query(
      `SELECT u.property_id, u.rental_type, u.price_per_night, u.cleaning_fee,
              u.min_nights, u.max_nights, u.weekly_discount_pct, u.monthly_discount_pct,
              u.weekend_adjustment_pct, u.early_bird_min_days, u.early_bird_discount_pct,
              u.last_minute_max_days, u.last_minute_adjustment_pct,
              u.advance_notice_days, u.max_advance_days,
              u.deposit_amount, u.deposit_to_confirm_pct,
              tc.currency AS currency, tc.rental_type AS tenant_rental_type,
              tc.occupancy_tax_pct AS occupancy_tax_pct
         FROM units u
         LEFT JOIN LATERAL (
           SELECT currency, rental_type, occupancy_tax_pct FROM tenant_config LIMIT 1
         ) tc ON true
         WHERE u.id = $1 AND u.property_id = $2`,
      [unitId, propertyId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(
        `Unidad ${unitId} no encontrada en la propiedad ${propertyId}`,
      );
    }
    return rows[0];
  }

  private async findSeasons(unitId: number): Promise<SeasonRule[]> {
    return this.dataSource.query<SeasonRule[]>(
      `SELECT start_date::text AS start_date, end_date::text AS end_date,
              price_per_night, min_nights
         FROM season_rules WHERE unit_id = $1`,
      [unitId],
    );
  }

  private assertUnitIsShortTerm(unit: UnitPricingRow): void {
    if (unit.rental_type !== 'SHORT_TERM' && unit.rental_type !== 'BOTH') {
      throw new BadRequestException(
        'La unidad no está habilitada para alquiler de corto plazo',
      );
    }
  }

  private assertDatesOrder(checkin: Date, checkout: Date): void {
    if (Number.isNaN(checkin.getTime()) || Number.isNaN(checkout.getTime())) {
      throw new BadRequestException('Fechas inválidas');
    }
    if (checkout <= checkin) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la de ingreso',
      );
    }
  }

  private assertNightsInRange(
    nights: number,
    minNights: number,
    unit: UnitPricingRow,
  ): void {
    const maxNights = unit.max_nights ? parseInt(unit.max_nights, 10) : 365;
    if (nights < minNights) {
      throw new BadRequestException(
        `La estadía mínima para esta unidad es ${minNights} noche(s)`,
      );
    }
    if (nights > maxNights) {
      throw new BadRequestException(
        `La estadía máxima para esta unidad es ${maxNights} noche(s)`,
      );
    }
  }

  private async assertAvailable(
    unitId: number,
    checkinDate: string,
    checkoutDate: string,
  ): Promise<void> {
    const rows = await this.dataSource.query<Array<{ unavailable: boolean }>>(
      `SELECT (
         EXISTS (
           SELECT 1 FROM reservations
            WHERE unit_id = $1
              AND status = ANY($2::text[])
              AND checkin_date < $4::date AND checkout_date > $3::date
         ) OR EXISTS (
           SELECT 1 FROM property_availability
            WHERE unit_id = $1
              AND date >= $3::date AND date < $4::date
              AND status <> 'available'
         ) OR EXISTS (
           SELECT 1 FROM contracts
            WHERE unit_id = $1
              AND status::text = ANY($5::text[])
              AND start_date < $4::date AND end_date > $3::date
         )
       ) AS unavailable`,
      [
        unitId,
        ['pending', 'confirmed', 'in_progress'],
        checkinDate,
        checkoutDate,
        ['FIRMADO', 'ACTIVO', 'POR_VENCER', 'RENOVADO'],
      ],
    );
    if (rows[0]?.unavailable) {
      throw new BadRequestException(
        'Las fechas seleccionadas no están disponibles',
      );
    }
  }

  private assertBookingWindow(
    leadTimeDays: number,
    unit: UnitPricingRow,
  ): void {
    const minimum = this.toOptionalInt(unit.advance_notice_days);
    const maximum = this.toOptionalInt(unit.max_advance_days);
    if (minimum !== undefined && leadTimeDays < minimum) {
      throw new BadRequestException(
        `Esta unidad requiere ${minimum} día(s) de anticipación`,
      );
    }
    if (maximum !== undefined && leadTimeDays > maximum) {
      throw new BadRequestException(
        `Solo se puede reservar hasta ${maximum} día(s) antes`,
      );
    }
  }

  private daysUntil(isoDate: string): number {
    const now = new Date();
    const todayUtc = Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
    );
    return Math.floor(
      (Date.parse(`${isoDate}T00:00:00Z`) - todayUtc) / 86400000,
    );
  }

  private toOptionalInt(value: string | null): number | undefined {
    if (value === null || value === undefined || value === '') return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private calculateNights(checkin: Date, checkout: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((checkout.getTime() - checkin.getTime()) / msPerDay);
  }

  private toNumber(value: string | null): number {
    const parsed = parseFloat(value ?? '0');
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
