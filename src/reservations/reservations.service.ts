import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { CreateReservationDto, BlockDatesDto } from './dto';
import { AvailabilityStatus } from './enums/availability-status.enum';
import {
  OCCUPYING_RESERVATION_STATUSES,
  ReservationStatus,
} from './enums/reservation-status.enum';
import { applyTenantSearchPath } from '../common/tenant/tenant-search-path';
import { ReservationNotificationService } from './reservation-notification.service';
import { ReservationRefundService } from './reservation-refund.service';
import { PriceLine, priceReservation } from './reservation-pricing';
import { resolveStayPricing, SeasonRule } from './season-pricing';
import {
  CancellationPolicy,
  computeCancellationRefund,
  computeRefundableAmount,
} from './cancellation-policy';

export interface DayAvailability {
  date: string;
  status: AvailabilityStatus;
}

export interface ReservationRow {
  id: number;
  property_id: number;
  unit_id: number;
  tenant_id: number;
  checkin_date: string;
  checkout_date: string;
  nights: number;
  price_per_night: string;
  cleaning_fee: string | null;
  total_amount: string;
  currency: string;
  status: ReservationStatus;
  notes: string | null;
  created_at: Date;
  expires_at?: Date | null;
  pricing_snapshot?: Record<string, unknown> | null;
}

export interface ExtendedReservationRow extends ReservationRow {
  amount_difference: number;
}

export interface ExtensionQuote {
  previous_checkout: string;
  new_checkout: string;
  additional_nights: number;
  currency: string;
  lines: PriceLine[];
  amount_difference: number;
  new_total: number;
}

export interface MyReservationRow extends ReservationRow {
  property_name: string | null;
  unit_number: string | null;
  paid_amount: string;
  has_review: boolean;
}

export interface CancellationPreview {
  refund_percentage: number;
  refund_amount: number;
  currency: string;
  /** Clave i18n del motivo (el frontend la traduce). */
  reason: string;
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  /**
   * Estados de contrato que ocupan la unidad: mientras exista uno que solape el
   * rango, la unidad no admite reservas de corto plazo (anti doble-booking §3.1).
   */
  private static readonly OCCUPYING_CONTRACT_STATUSES: readonly ContractStatus[] =
    [
      ContractStatus.FIRMADO,
      ContractStatus.ACTIVO,
      ContractStatus.POR_VENCER,
      ContractStatus.RENOVADO,
    ];

  /** Estados desde los que el inquilino puede cancelar su propia reserva. */
  private static readonly GUEST_CANCELABLE_STATUSES: readonly ReservationStatus[] =
    [
      ReservationStatus.PENDING_PAYMENT,
      ReservationStatus.PENDING,
      ReservationStatus.CONFIRMED,
    ];

  private static readonly PAYMENT_HOLD_MINUTES = 10;
  private static readonly REQUEST_HOLD_HOURS = 24;
  private static readonly MAX_ACTIVE_HOLDS_PER_GUEST = 3;

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationService: ReservationNotificationService,
    private readonly refundService: ReservationRefundService,
  ) {}

  // ─── Catalog (público) ────────────────────────────────────────────────────

  async getMonthAvailability(
    propertyId: number,
    month: string,
    unitId?: number,
  ): Promise<DayAvailability[]> {
    this.assertValidMonth(month);

    const [year, monthNum] = month.split('-').map(Number);
    const daysInMonth = new Date(year, monthNum, 0).getDate();
    const allDates = Array.from({ length: daysInMonth }, (_, i) => {
      const d = i + 1;
      return `${year}-${String(monthNum).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    });

    const availabilityParams: unknown[] = [
      propertyId,
      `${month}-01`,
      `${month}-${String(daysInMonth).padStart(2, '0')}`,
    ];
    let availabilityUnitFilter = '';
    if (unitId !== undefined) {
      availabilityUnitFilter = ' AND unit_id = $4';
      availabilityParams.push(unitId);
    }

    const rows: Array<{ date: string; status: string }> =
      await this.dataSource.query(
        `SELECT date::text, status FROM property_availability
       WHERE property_id = $1 AND date BETWEEN $2 AND $3${availabilityUnitFilter}`,
        availabilityParams,
      );

    const statusMap = new Map(
      rows.map((r) => [r.date, r.status as AvailabilityStatus]),
    );

    const reservationParams: unknown[] = [
      propertyId,
      OCCUPYING_RESERVATION_STATUSES,
      `${month}-01`,
      `${month}-${String(daysInMonth).padStart(2, '0')}`,
    ];
    let reservationUnitFilter = '';
    if (unitId !== undefined) {
      reservationUnitFilter = ' AND r.unit_id = $5';
      reservationParams.push(unitId);
    }

    const bookedRows: Array<{ date: string }> = await this.dataSource.query(
      `SELECT gs::date::text AS date
         FROM reservations r
         CROSS JOIN LATERAL generate_series(
           GREATEST(r.checkin_date, $3::date),
           LEAST(r.checkout_date - INTERVAL '1 day', $4::date),
           INTERVAL '1 day'
         ) AS gs
        WHERE r.property_id = $1
          AND r.status = ANY($2::text[])
          AND r.checkin_date <= $4::date
          AND r.checkout_date > $3::date${reservationUnitFilter}`,
      reservationParams,
    );

    for (const row of bookedRows) {
      statusMap.set(row.date, AvailabilityStatus.BOOKED);
    }

    return allDates.map((date) => ({
      date,
      status: statusMap.get(date) ?? AvailabilityStatus.AVAILABLE,
    }));
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async blockDates(
    propertyId: number,
    unitId: number,
    dto: BlockDatesDto,
    adminUserId: number,
  ): Promise<{ blocked: number }> {
    const unit = await this.findUnitOrFail(propertyId, unitId);
    this.assertUnitIsShortTerm(unit);

    const conflicting = await this.findBookedDates(unitId, dto.dates);
    if (conflicting.length > 0) {
      throw new ConflictException(
        `Las fechas ${conflicting.join(', ')} ya tienen reservas confirmadas y no pueden bloquearse`,
      );
    }

    for (const date of dto.dates) {
      await this.dataSource.query(
        `INSERT INTO property_availability (property_id, unit_id, date, status, blocked_by, notes)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (unit_id, date) DO UPDATE
           SET status = $4, blocked_by = $5, notes = $6`,
        [
          propertyId,
          unitId,
          date,
          AvailabilityStatus.BLOCKED,
          adminUserId,
          dto.reason ?? null,
        ],
      );
    }

    this.logger.log(
      `Admin ${adminUserId} blocked ${dto.dates.length} dates for unit ${unitId}`,
    );
    return { blocked: dto.dates.length };
  }

  // ─── Portal inquilino ─────────────────────────────────────────────────────

  async createReservation(
    dto: CreateReservationDto,
    tenantId: number,
    schemaName?: string,
    tenantSlug?: string,
    idempotencyKey?: string,
  ): Promise<ReservationRow> {
    if (idempotencyKey) {
      const existing = await this.dataSource.query<ReservationRow[]>(
        `SELECT * FROM reservations
          WHERE tenant_id = $1 AND idempotency_key = $2
          LIMIT 1`,
        [tenantId, idempotencyKey],
      );
      if (existing[0]) return existing[0];
    }

    const checkin = new Date(dto.checkin_date);
    const checkout = new Date(dto.checkout_date);

    this.assertDatesOrder(checkin, checkout);

    const unit = await this.findUnitOrFail(dto.property_id, dto.unit_id);
    this.assertUnitIsShortTerm(unit);
    await this.validateTenantConfigAllowsShortTerm();

    const nights = this.calculateNights(checkin, checkout);
    const leadTimeDays = this.daysUntil(dto.checkin_date);
    this.assertBookingWindow(leadTimeDays, unit);

    // Resuelve precio por noche y noches mínimas por temporada (si la hay).
    const baseMinNights = unit.min_nights ? parseInt(unit.min_nights, 10) : 1;
    const seasons = await this.findSeasons(dto.unit_id);
    const stay = resolveStayPricing(
      dto.checkin_date,
      nights,
      parseFloat(unit.price_per_night ?? '0'),
      baseMinNights,
      seasons,
    );
    this.assertNightsInRange(nights, stay.effectiveMinNights, unit);

    const nightDates = this.generateNightDates(checkin, checkout);

    // Coherencia (§3.1): la unidad no puede tener un contrato de largo plazo que
    // ocupe el rango. Pre-chequeo de disponibilidad para un error claro y temprano.
    await this.assertNoActiveContractOverlap(
      dto.unit_id,
      dto.checkin_date,
      dto.checkout_date,
    );
    await this.assertNoReservationOverlap(
      dto.unit_id,
      dto.checkin_date,
      dto.checkout_date,
    );
    await this.assertDatesAvailable(dto.unit_id, nightDates);

    const pricePerNight = parseFloat(unit.price_per_night ?? '0');
    const cleaningFee = parseFloat(unit.cleaning_fee ?? '0');
    const currency = unit.tenant_currency ?? unit.currency ?? 'BOB';

    // Mismo motor de pricing que el quote: el monto cobrado = el mostrado
    // (incluye descuentos por estadía e impuesto de ocupación).
    const pricing = priceReservation({
      pricePerNight,
      nights,
      nightlyPrices: stay.nightlyPrices,
      nightlyDates: stay.nightlyDates,
      cleaningFee,
      weeklyDiscountPct: parseFloat(unit.weekly_discount_pct ?? '0'),
      monthlyDiscountPct: parseFloat(unit.monthly_discount_pct ?? '0'),
      occupancyTaxPct: parseFloat(unit.occupancy_tax_pct ?? '0'),
      securityDeposit: parseFloat(unit.deposit_amount ?? '0'),
      weekendAdjustmentPct: parseFloat(unit.weekend_adjustment_pct ?? '0'),
      leadTimeDays,
      earlyBirdMinDays: this.toOptionalInt(unit.early_bird_min_days),
      earlyBirdDiscountPct: parseFloat(unit.early_bird_discount_pct ?? '0'),
      lastMinuteMaxDays: this.toOptionalInt(unit.last_minute_max_days),
      lastMinuteAdjustmentPct: parseFloat(
        unit.last_minute_adjustment_pct ?? '0',
      ),
    });
    // Se cobra el alojamiento + el depósito reembolsable.
    const totalAmount = pricing.totalDue;
    const securityDeposit = pricing.deposit;

    // Adelanto para confirmar: si la unidad define un % (0 < pct < 100), la
    // reserva se confirma al cubrir ese adelanto y el resto queda como saldo
    // pendiente (p. ej. a pagar en efectivo al check-in). NULL/>=100 = pago total.
    const depositPct =
      unit.deposit_to_confirm_pct != null
        ? Number(unit.deposit_to_confirm_pct)
        : null;
    const depositRequired =
      depositPct != null && depositPct > 0 && depositPct < 100
        ? Math.round(totalAmount * depositPct) / 100
        : totalAmount;

    // Una reserva instantánea retiene las noches durante un plazo corto, pero no
    // se confirma hasta que el pago aprobado cubra el total de la reserva.
    const isRequestBooking = unit.booking_mode === 'request';
    const initialStatus = isRequestBooking
      ? ReservationStatus.PENDING
      : ReservationStatus.PENDING_PAYMENT;
    const expiresAt = new Date(
      Date.now() +
        (isRequestBooking
          ? ReservationsService.REQUEST_HOLD_HOURS * 60 * 60 * 1000
          : ReservationsService.PAYMENT_HOLD_MINUTES * 60 * 1000),
    );

    // La reserva y la reclamación de noches se confirman atómicamente: si no se
    // pueden ocupar TODAS las noches, se revierte la reserva (sin booking parcial).
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await applyTenantSearchPath(queryRunner);
    await queryRunner.startTransaction();

    try {
      if (idempotencyKey) {
        const existing = (await queryRunner.query(
          `SELECT * FROM reservations
            WHERE tenant_id = $1 AND idempotency_key = $2
            LIMIT 1
            FOR UPDATE`,
          [tenantId, idempotencyKey],
        )) as ReservationRow[];
        if (existing[0]) {
          await queryRunner.commitTransaction();
          return existing[0];
        }
      }

      const activeHolds = (await queryRunner.query(
        `SELECT COUNT(*)::int AS count
           FROM reservations
          WHERE tenant_id = $1
            AND status IN ('pending', 'pending_payment')
            AND COALESCE(expires_at, created_at + INTERVAL '24 hours') > NOW()`,
        [tenantId],
      )) as Array<{ count: number }>;
      if (
        Number(activeHolds[0]?.count ?? 0) >=
        ReservationsService.MAX_ACTIVE_HOLDS_PER_GUEST
      ) {
        throw new ConflictException(
          'Tenés demasiadas reservas pendientes. Completá o cancelá una antes de continuar.',
        );
      }

      const [reservation] = (await queryRunner.query(
        `INSERT INTO reservations
           (property_id, unit_id, tenant_id, checkin_date, checkout_date,
            nights, price_per_night, cleaning_fee, security_deposit, total_amount,
            currency, status, notes, pricing_snapshot, expires_at, idempotency_key,
            deposit_required)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14::jsonb, $15, $16, $17)
         RETURNING *`,
        [
          dto.property_id,
          dto.unit_id,
          tenantId,
          dto.checkin_date,
          dto.checkout_date,
          nights,
          pricePerNight,
          cleaningFee,
          securityDeposit,
          totalAmount,
          currency,
          initialStatus,
          dto.notes ?? null,
          JSON.stringify({
            quoted_at: new Date().toISOString(),
            checkin_date: dto.checkin_date,
            checkout_date: dto.checkout_date,
            lines: pricing.lines,
            subtotal: pricing.subtotal,
            discount_total: pricing.discountTotal,
            tax_total: pricing.taxTotal,
            total: pricing.total,
            deposit: pricing.deposit,
            total_due: pricing.totalDue,
          }),
          expiresAt,
          idempotencyKey ?? null,
          depositRequired,
        ],
      )) as ReservationRow[];

      await this.claimNightsOrFail(
        queryRunner,
        dto.property_id,
        dto.unit_id,
        nightDates,
        reservation.id,
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Reservation ${reservation.id} created for unit ${dto.unit_id} by tenant ${tenantId}`,
      );

      // Request-to-book: avisa a los admins que hay una solicitud por confirmar.
      // Best-effort fuera de la transacción para no acoplar el alta a la notificación.
      if (initialStatus === ReservationStatus.PENDING && schemaName) {
        await this.notificationService.notifyAdminsOfRequest(
          schemaName,
          {
            id: reservation.id,
            checkin_date: dto.checkin_date,
            checkout_date: dto.checkout_date,
          },
          tenantSlug,
        );
      }

      return reservation;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (this.isReservationOverlapDatabaseError(error)) {
        throw new ConflictException(
          'Las fechas seleccionadas ya no están disponibles. Elegí otro rango e intentá nuevamente.',
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async extendReservation(
    id: number,
    tenantId: number,
    newCheckoutDate: string,
  ): Promise<ExtendedReservationRow> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await applyTenantSearchPath(queryRunner);
    await queryRunner.startTransaction();

    try {
      const reservations = (await queryRunner.query(
        `SELECT * FROM reservations WHERE id = $1 AND tenant_id = $2 FOR UPDATE`,
        [id, tenantId],
      )) as ReservationRow[];
      const reservation = reservations[0];
      if (!reservation)
        throw new NotFoundException(`Reserva ${id} no encontrada`);
      // Las columnas DATE llegan como objetos Date desde el driver; normalizar a
      // string YYYY-MM-DD para comparaciones y cálculo de precios consistentes.
      reservation.checkin_date = this.toIsoDateString(reservation.checkin_date);
      reservation.checkout_date = this.toIsoDateString(
        reservation.checkout_date,
      );
      if (
        ![
          ReservationStatus.PENDING_PAYMENT,
          ReservationStatus.PENDING,
          ReservationStatus.CONFIRMED,
        ].includes(reservation.status)
      ) {
        throw new ConflictException('Esta reserva ya no puede extenderse');
      }
      if (newCheckoutDate <= reservation.checkout_date) {
        throw new BadRequestException(
          'La nueva salida debe ser posterior a la salida actual',
        );
      }

      const units = (await queryRunner.query(
        `SELECT u.*, tc.occupancy_tax_pct
           FROM units u
           LEFT JOIN LATERAL (SELECT occupancy_tax_pct FROM tenant_config LIMIT 1) tc ON true
          WHERE u.id = $1 AND u.property_id = $2`,
        [reservation.unit_id, reservation.property_id],
      )) as Array<Record<string, string>>;
      const unit = units[0];
      if (!unit) throw new NotFoundException('Unidad no encontrada');

      const totalNights = this.calculateNights(
        new Date(reservation.checkin_date),
        new Date(newCheckoutDate),
      );
      this.assertNightsInRange(totalNights, 1, unit);
      this.assertBookingWindow(this.daysUntil(reservation.checkout_date), unit);

      const addedDates = this.generateNightDates(
        new Date(reservation.checkout_date),
        new Date(newCheckoutDate),
      );

      const contractOverlap = (await queryRunner.query(
        `SELECT id FROM contracts
          WHERE unit_id = $1
            AND status::text = ANY($2::text[])
            AND start_date < $4::date
            AND end_date > $3::date
          LIMIT 1`,
        [
          reservation.unit_id,
          ReservationsService.OCCUPYING_CONTRACT_STATUSES,
          reservation.checkout_date,
          newCheckoutDate,
        ],
      )) as Array<{ id: number }>;
      if (contractOverlap.length > 0) {
        throw new ConflictException(
          'La unidad tiene un contrato de largo plazo activo en las fechas adicionales.',
        );
      }

      const seasons = (await queryRunner.query(
        `SELECT start_date::text, end_date::text, price_per_night, min_nights
           FROM season_rules WHERE unit_id = $1`,
        [reservation.unit_id],
      )) as SeasonRule[];
      const addedStay = resolveStayPricing(
        reservation.checkout_date,
        addedDates.length,
        parseFloat(unit.price_per_night ?? '0'),
        1,
        seasons,
      );
      const leadTimeDays = this.daysUntil(reservation.checkout_date);
      const pricing = priceReservation({
        pricePerNight: parseFloat(unit.price_per_night ?? '0'),
        nights: addedDates.length,
        nightlyPrices: addedStay.nightlyPrices,
        nightlyDates: addedStay.nightlyDates,
        cleaningFee: 0,
        weeklyDiscountPct: 0,
        monthlyDiscountPct: 0,
        occupancyTaxPct: parseFloat(unit.occupancy_tax_pct ?? '0'),
        weekendAdjustmentPct: parseFloat(unit.weekend_adjustment_pct ?? '0'),
        leadTimeDays,
        earlyBirdMinDays: this.toOptionalInt(unit.early_bird_min_days),
        earlyBirdDiscountPct: parseFloat(unit.early_bird_discount_pct ?? '0'),
        lastMinuteMaxDays: this.toOptionalInt(unit.last_minute_max_days),
        lastMinuteAdjustmentPct: parseFloat(
          unit.last_minute_adjustment_pct ?? '0',
        ),
      });

      await this.claimNightsOrFail(
        queryRunner,
        reservation.property_id,
        reservation.unit_id,
        addedDates,
        reservation.id,
      );

      const previousSnapshot = reservation.pricing_snapshot ?? {};
      const extensions: unknown[] = Array.isArray(
        previousSnapshot['extensions'],
      )
        ? (previousSnapshot['extensions'] as unknown[])
        : [];
      const nextTotal = Number(reservation.total_amount) + pricing.total;
      const [updated] = (await queryRunner.query(
        `UPDATE reservations
            SET checkout_date = $2, nights = $3, total_amount = $4,
                pricing_snapshot = $5::jsonb, updated_at = NOW()
          WHERE id = $1 RETURNING *`,
        [
          id,
          newCheckoutDate,
          totalNights,
          nextTotal,
          JSON.stringify({
            ...previousSnapshot,
            extensions: [
              ...extensions,
              {
                extended_at: new Date().toISOString(),
                previous_checkout: reservation.checkout_date,
                new_checkout: newCheckoutDate,
                lines: pricing.lines,
                amount: pricing.total,
              },
            ],
          }),
        ],
      )) as ReservationRow[];

      await queryRunner.commitTransaction();
      return { ...updated, amount_difference: pricing.total };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      if (this.isReservationOverlapDatabaseError(error)) {
        throw new ConflictException(
          'Las fechas adicionales ya no están disponibles. Elegí otra salida e intentá nuevamente.',
        );
      }
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async quoteExtension(
    id: number,
    tenantId: number,
    newCheckoutDate: string,
  ): Promise<ExtensionQuote> {
    const reservations = await this.dataSource.query<ReservationRow[]>(
      `SELECT * FROM reservations WHERE id = $1 AND tenant_id = $2`,
      [id, tenantId],
    );
    const reservation = reservations[0];
    if (!reservation)
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    // Las columnas DATE llegan como objetos Date desde el driver; normalizar a
    // string YYYY-MM-DD para comparaciones y cálculo de precios consistentes.
    reservation.checkin_date = this.toIsoDateString(reservation.checkin_date);
    reservation.checkout_date = this.toIsoDateString(reservation.checkout_date);
    if (
      ![
        ReservationStatus.PENDING_PAYMENT,
        ReservationStatus.PENDING,
        ReservationStatus.CONFIRMED,
      ].includes(reservation.status)
    ) {
      throw new ConflictException('Esta reserva ya no puede extenderse');
    }
    if (newCheckoutDate <= reservation.checkout_date) {
      throw new BadRequestException(
        'La nueva salida debe ser posterior a la salida actual',
      );
    }

    const unit = await this.findUnitOrFail(
      reservation.property_id,
      reservation.unit_id,
    );
    const totalNights = this.calculateNights(
      new Date(reservation.checkin_date),
      new Date(newCheckoutDate),
    );
    this.assertNightsInRange(totalNights, 1, unit);
    this.assertBookingWindow(this.daysUntil(reservation.checkout_date), unit);

    const addedDates = this.generateNightDates(
      new Date(reservation.checkout_date),
      new Date(newCheckoutDate),
    );
    await this.assertNoActiveContractOverlap(
      reservation.unit_id,
      reservation.checkout_date,
      newCheckoutDate,
    );
    await this.assertNoReservationOverlap(
      reservation.unit_id,
      reservation.checkout_date,
      newCheckoutDate,
    );
    await this.assertDatesAvailable(reservation.unit_id, addedDates);

    const seasons = await this.findSeasons(reservation.unit_id);
    const addedStay = resolveStayPricing(
      reservation.checkout_date,
      addedDates.length,
      parseFloat(unit.price_per_night ?? '0'),
      1,
      seasons,
    );
    const pricing = priceReservation({
      pricePerNight: parseFloat(unit.price_per_night ?? '0'),
      nights: addedDates.length,
      nightlyPrices: addedStay.nightlyPrices,
      nightlyDates: addedStay.nightlyDates,
      cleaningFee: 0,
      weeklyDiscountPct: 0,
      monthlyDiscountPct: 0,
      occupancyTaxPct: parseFloat(unit.occupancy_tax_pct ?? '0'),
      weekendAdjustmentPct: parseFloat(unit.weekend_adjustment_pct ?? '0'),
      leadTimeDays: this.daysUntil(reservation.checkout_date),
      earlyBirdMinDays: this.toOptionalInt(unit.early_bird_min_days),
      earlyBirdDiscountPct: parseFloat(unit.early_bird_discount_pct ?? '0'),
      lastMinuteMaxDays: this.toOptionalInt(unit.last_minute_max_days),
      lastMinuteAdjustmentPct: parseFloat(
        unit.last_minute_adjustment_pct ?? '0',
      ),
    });

    return {
      previous_checkout: reservation.checkout_date,
      new_checkout: newCheckoutDate,
      additional_nights: addedDates.length,
      currency: reservation.currency,
      lines: pricing.lines,
      amount_difference: pricing.total,
      new_total: Number(reservation.total_amount) + pricing.total,
    };
  }

  /**
   * Reservas del inquilino autenticado, con nombre de propiedad y unidad. Sólo
   * se exponen las propias (filtrado por tenant_id) — aislamiento dentro del
   * schema del tenant a nivel de fila.
   */
  async findMyReservations(tenantId: number): Promise<MyReservationRow[]> {
    return this.dataSource.query(
      `SELECT r.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              COALESCE(pay.paid, 0)::text AS paid_amount,
              EXISTS(SELECT 1 FROM reviews rv WHERE rv.reservation_id = r.id) AS has_review
         FROM reservations r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS paid
           FROM payments
           WHERE reservation_id = r.id
             AND status IN ('PENDING', 'PROCESSING', 'APPROVED')
         ) pay ON true
         WHERE r.tenant_id = $1
         ORDER BY r.checkin_date DESC, r.id DESC`,
      [tenantId],
    );
  }

  /**
   * Previsualiza el reembolso que correspondería si el inquilino cancelara AHORA
   * (solo lectura, sin efectos). Usa la misma `computeCancellationRefund` que la
   * cancelación real, sobre la suma de pagos APROBADOS (el dinero efectivamente
   * cobrado, que es lo reembolsable).
   */
  async getCancellationPreview(
    id: number,
    tenantId: number,
  ): Promise<CancellationPreview> {
    const rows = await this.dataSource.query<
      Array<{
        checkin_date: string;
        currency: string;
        total_amount: string;
        security_deposit: string;
        cancellation_policy: string | null;
        approved_paid: string;
      }>
    >(
      `SELECT r.checkin_date, r.currency, r.total_amount, r.security_deposit,
              u.cancellation_policy,
              COALESCE((
                SELECT SUM(amount) FROM payments
                 WHERE reservation_id = r.id AND status = 'APPROVED'
              ), 0)::text AS approved_paid
         FROM reservations r
         JOIN units u ON u.id = r.unit_id
        WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }

    const row = rows[0];
    const policy = (row.cancellation_policy ??
      'moderate') as CancellationPolicy;
    const { refundPercentage, reason } = computeCancellationRefund(
      policy,
      new Date(row.checkin_date),
      new Date(),
    );
    const deposit = Number(row.security_deposit);
    const rentPortion = Number(row.total_amount) - deposit;
    const refundAmount = computeRefundableAmount(
      refundPercentage,
      Number(row.approved_paid),
      rentPortion,
    );

    return {
      refund_percentage: refundPercentage,
      refund_amount: refundAmount,
      currency: row.currency,
      reason,
    };
  }

  /**
   * El inquilino cancela una reserva propia. Sólo se permite sobre estados que
   * aún ocupan la unidad y son cancelables por el huésped (PENDING/CONFIRMED);
   * las noches se liberan en la misma transacción. La verificación de propiedad
   * (tenant_id) evita que un inquilino cancele reservas de otro.
   */
  async cancelMyReservation(
    id: number,
    tenantId: number,
  ): Promise<MyReservationRow> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await applyTenantSearchPath(queryRunner);
    await queryRunner.startTransaction();

    try {
      const current = (await queryRunner.query(
        `SELECT r.id, r.tenant_id, r.status, r.checkin_date,
                r.total_amount, r.security_deposit,
                u.cancellation_policy,
                COALESCE((
                  SELECT SUM(amount) FROM payments
                   WHERE reservation_id = r.id AND status = 'APPROVED'
                ), 0)::text AS approved_paid
           FROM reservations r
           JOIN units u ON u.id = r.unit_id
          WHERE r.id = $1
          FOR UPDATE OF r`,
        [id],
      )) as Array<{
        id: number;
        tenant_id: number;
        status: ReservationStatus;
        checkin_date: string;
        total_amount: string;
        security_deposit: string;
        cancellation_policy: string | null;
        approved_paid: string;
      }>;

      if (current.length === 0 || current[0].tenant_id !== tenantId) {
        throw new NotFoundException(`Reserva ${id} no encontrada`);
      }

      const fromStatus = current[0].status;
      if (!ReservationsService.GUEST_CANCELABLE_STATUSES.includes(fromStatus)) {
        throw new ConflictException(
          `No se puede cancelar una reserva en estado '${fromStatus}'.`,
        );
      }

      await queryRunner.query(
        `UPDATE reservations SET status = $1, updated_at = NOW() WHERE id = $2`,
        [ReservationStatus.CANCELLED, id],
      );

      await queryRunner.query(
        `UPDATE property_availability
            SET status = $1, reservation_id = NULL
          WHERE reservation_id = $2 AND status = $3`,
        [AvailabilityStatus.AVAILABLE, id, AvailabilityStatus.BOOKED],
      );

      // Reembolso según la política (sobre el alquiler) + depósito íntegro: el
      // alquiler sigue la política/antelación; el depósito se devuelve siempre.
      const policy = (current[0].cancellation_policy ??
        'moderate') as CancellationPolicy;
      const { refundPercentage } = computeCancellationRefund(
        policy,
        new Date(current[0].checkin_date),
        new Date(),
      );
      const deposit = Number(current[0].security_deposit);
      const rentPortion = Number(current[0].total_amount) - deposit;
      const refundable = computeRefundableAmount(
        refundPercentage,
        Number(current[0].approved_paid),
        rentPortion,
      );
      await this.refundService.refundAbsoluteAmount(
        queryRunner,
        id,
        refundable,
        tenantId,
      );

      await queryRunner.commitTransaction();

      this.logger.log(
        `Tenant ${tenantId} cancelled reservation ${id} (refund ${refundPercentage}%)`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const [reservation] = await this.findOneForTenant(id, tenantId);
    return reservation;
  }

  private async findOneForTenant(
    id: number,
    tenantId: number,
  ): Promise<MyReservationRow[]> {
    return this.dataSource.query(
      `SELECT r.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              COALESCE(pay.paid, 0)::text AS paid_amount
         FROM reservations r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
         LEFT JOIN LATERAL (
           SELECT SUM(amount) AS paid
           FROM payments
           WHERE reservation_id = r.id
             AND status IN ('PENDING', 'PROCESSING', 'APPROVED')
         ) pay ON true
         WHERE r.id = $1 AND r.tenant_id = $2`,
      [id, tenantId],
    );
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  /**
   * Reclama atómicamente cada noche en property_availability. La constraint
   * UNIQUE(unit_id, date) actúa de árbitro bajo concurrencia: dos reservas que
   * compitan por la misma noche no pueden ganar ambas. Sólo se ocupa una noche
   * si estaba `available` (o no existía); si no se reclaman TODAS las noches
   * solicitadas, se aborta para que la transacción revierta la reserva.
   */
  private async claimNightsOrFail(
    queryRunner: QueryRunner,
    propertyId: number,
    unitId: number,
    nightDates: string[],
    reservationId: number,
  ): Promise<void> {
    const claimed = (await queryRunner.query(
      `INSERT INTO property_availability (property_id, unit_id, date, status, reservation_id)
       SELECT $1, $2, d, $4, $5
       FROM unnest($3::date[]) AS d
       ON CONFLICT (unit_id, date) DO UPDATE
         SET status = EXCLUDED.status,
             reservation_id = EXCLUDED.reservation_id
         WHERE property_availability.status = $6
       RETURNING date::text`,
      [
        propertyId,
        unitId,
        nightDates,
        AvailabilityStatus.BOOKED,
        reservationId,
        AvailabilityStatus.AVAILABLE,
      ],
    )) as Array<{ date: string }>;

    if (claimed.length !== nightDates.length) {
      throw new ConflictException(
        'Algunas fechas dejaron de estar disponibles. Por favor intenta nuevamente.',
      );
    }
  }

  /**
   * §3.1 (dirección reserva→contrato): rechaza la reserva si la unidad tiene un
   * contrato de largo plazo que ocupa el rango [checkin, checkout). Se castea
   * `status::text` por ser enum Postgres comparado contra un array de texto.
   */
  private async assertNoActiveContractOverlap(
    unitId: number,
    checkinDate: string,
    checkoutDate: string,
  ): Promise<void> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT id FROM contracts
         WHERE unit_id = $1
           AND status::text = ANY($2::text[])
           AND start_date < $4::date
           AND end_date   > $3::date
         LIMIT 1`,
      [
        unitId,
        ReservationsService.OCCUPYING_CONTRACT_STATUSES,
        checkinDate,
        checkoutDate,
      ],
    );

    if (rows.length > 0) {
      throw new ConflictException(
        'La unidad tiene un contrato de largo plazo activo en esas fechas y no admite reservas.',
      );
    }
  }

  private async assertNoReservationOverlap(
    unitId: number,
    checkinDate: string,
    checkoutDate: string,
  ): Promise<void> {
    const rows: Array<{ id: number }> = await this.dataSource.query(
      `SELECT id FROM reservations
         WHERE unit_id = $1
           AND status = ANY($2::text[])
           AND checkin_date < $4::date
           AND checkout_date > $3::date
         LIMIT 1`,
      [unitId, OCCUPYING_RESERVATION_STATUSES, checkinDate, checkoutDate],
    );

    if (rows.length > 0) {
      throw new ConflictException(
        'Las fechas seleccionadas ya no están disponibles. Elegí otro rango e intentá nuevamente.',
      );
    }
  }

  private async findUnitOrFail(
    propertyId: number,
    unitId: number,
  ): Promise<Record<string, string>> {
    const rows: Record<string, string>[] = await this.dataSource.query(
      `SELECT u.*, tc.rental_type AS tenant_rental_type,
              tc.currency AS tenant_currency, tc.occupancy_tax_pct AS occupancy_tax_pct
         FROM units u
         LEFT JOIN LATERAL (
           SELECT rental_type, currency, occupancy_tax_pct FROM tenant_config LIMIT 1
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

  private assertUnitIsShortTerm(unit: Record<string, string>): void {
    if (unit.rental_type !== 'SHORT_TERM' && unit.rental_type !== 'BOTH') {
      throw new BadRequestException(
        `La unidad no está habilitada para alquiler de corto plazo (rental_type: ${unit.rental_type ?? 'no definido'})`,
      );
    }
  }

  private async validateTenantConfigAllowsShortTerm(): Promise<void> {
    const rows: Array<{ rental_type: string }> = await this.dataSource.query(
      `SELECT rental_type FROM tenant_config LIMIT 1`,
    );

    const tenantRentalType = rows[0]?.rental_type;
    if (tenantRentalType === 'LONG_TERM') {
      throw new BadRequestException(
        'Este tenant solo admite alquileres de largo plazo. Las reservas de corto plazo no están habilitadas.',
      );
    }
  }

  private async findBookedDates(
    unitId: number,
    dates: string[],
  ): Promise<string[]> {
    const rows: Array<{ date: string }> = await this.dataSource.query(
      `SELECT date::text FROM property_availability
       WHERE unit_id = $1 AND status = $2 AND date = ANY($3::date[])`,
      [unitId, AvailabilityStatus.BOOKED, dates],
    );
    return rows.map((r) => r.date);
  }

  private async assertDatesAvailable(
    unitId: number,
    dates: string[],
  ): Promise<void> {
    const rows: Array<{ date: string; status: string }> =
      await this.dataSource.query(
        `SELECT date::text, status FROM property_availability
       WHERE unit_id = $1 AND status != $2 AND date = ANY($3::date[])`,
        [unitId, AvailabilityStatus.AVAILABLE, dates],
      );

    if (rows.length > 0) {
      const blocked = rows.map((r) => r.date);
      throw new ConflictException(
        `Las siguientes fechas no están disponibles: ${blocked.join(', ')}`,
      );
    }
  }

  private isReservationOverlapDatabaseError(error: unknown): boolean {
    return (
      !!error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: unknown }).code === '23P01'
    );
  }

  private assertDatesOrder(checkin: Date, checkout: Date): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkin < today) {
      throw new BadRequestException(
        'La fecha de ingreso no puede ser en el pasado',
      );
    }
    if (checkout <= checkin) {
      throw new BadRequestException(
        'La fecha de salida debe ser posterior a la de ingreso',
      );
    }
  }

  private async findSeasons(unitId: number): Promise<SeasonRule[]> {
    return this.dataSource.query<SeasonRule[]>(
      `SELECT start_date::text AS start_date, end_date::text AS end_date,
              price_per_night, min_nights
         FROM season_rules WHERE unit_id = $1`,
      [unitId],
    );
  }

  private assertNightsInRange(
    nights: number,
    minNights: number,
    unit: Record<string, string>,
  ): void {
    const maxNights = unit.max_nights ? parseInt(unit.max_nights) : 365;

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

  private assertBookingWindow(
    leadTimeDays: number,
    unit: Record<string, string>,
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

  private toOptionalInt(value: string | undefined): number | undefined {
    if (value === undefined || value === '') return undefined;
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  private assertValidMonth(month: string): void {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException(
        'El parámetro month debe tener formato YYYY-MM',
      );
    }
    const [year, monthNum] = month.split('-').map(Number);
    if (monthNum < 1 || monthNum > 12) {
      throw new BadRequestException('Mes inválido');
    }
    if (year < 2020 || year > 2100) {
      throw new BadRequestException('Año fuera de rango');
    }
  }

  private calculateNights(checkin: Date, checkout: Date): number {
    const msPerDay = 1000 * 60 * 60 * 24;
    return Math.round((checkout.getTime() - checkin.getTime()) / msPerDay);
  }

  /**
   * Normaliza un valor de fecha a 'YYYY-MM-DD'. El driver de Postgres devuelve
   * las columnas DATE como objetos `Date`; interpolarlos en strings ISO (p. ej.
   * `${date}T00:00:00Z`) produce fechas inválidas. Convertir aquí evita ese
   * fallo en el cálculo de precios por temporada y en las comparaciones de fechas.
   */
  private toIsoDateString(value: string | Date): string {
    return value instanceof Date
      ? value.toISOString().slice(0, 10)
      : value.slice(0, 10);
  }

  private generateNightDates(checkin: Date, checkout: Date): string[] {
    const dates: string[] = [];
    const current = new Date(checkin);

    while (current < checkout) {
      dates.push(current.toISOString().split('T')[0]);
      current.setDate(current.getDate() + 1);
    }

    return dates;
  }
}
