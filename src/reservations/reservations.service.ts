import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CreateReservationDto, BlockDatesDto } from './dto';
import { AvailabilityStatus } from './enums/availability-status.enum';
import { ReservationStatus } from './enums/reservation-status.enum';

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
}

@Injectable()
export class ReservationsService {
  private readonly logger = new Logger(ReservationsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
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

    const params: unknown[] = [propertyId, `${month}-01`, `${month}-${String(daysInMonth).padStart(2, '0')}`];
    let unitFilter = '';
    if (unitId !== undefined) {
      unitFilter = ' AND unit_id = $4';
      params.push(unitId);
    }

    const rows: Array<{ date: string; status: string }> = await this.dataSource.query(
      `SELECT date::text, status FROM property_availability
       WHERE property_id = $1 AND date BETWEEN $2 AND $3${unitFilter}`,
      params,
    );

    const statusMap = new Map(rows.map((r) => [r.date, r.status as AvailabilityStatus]));

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
        [propertyId, unitId, date, AvailabilityStatus.BLOCKED, adminUserId, dto.reason ?? null],
      );
    }

    this.logger.log(`Admin ${adminUserId} blocked ${dto.dates.length} dates for unit ${unitId}`);
    return { blocked: dto.dates.length };
  }

  // ─── Portal inquilino ─────────────────────────────────────────────────────

  async createReservation(
    dto: CreateReservationDto,
    tenantId: number,
  ): Promise<ReservationRow> {
    const checkin = new Date(dto.checkin_date);
    const checkout = new Date(dto.checkout_date);

    this.assertDatesOrder(checkin, checkout);

    const unit = await this.findUnitOrFail(dto.property_id, dto.unit_id);
    this.assertUnitIsShortTerm(unit);
    await this.validateTenantConfigAllowsShortTerm();

    const nights = this.calculateNights(checkin, checkout);
    this.assertNightsInRange(nights, unit);

    const nightDates = this.generateNightDates(checkin, checkout);
    await this.assertDatesAvailable(dto.unit_id, nightDates);

    const pricePerNight = parseFloat(unit.price_per_night ?? '0');
    const cleaningFee = parseFloat(unit.cleaning_fee ?? '0');
    const totalAmount = pricePerNight * nights + cleaningFee;
    const currency = unit.currency ?? 'BOB';

    const [reservation]: ReservationRow[] = await this.dataSource.query(
      `INSERT INTO reservations
         (property_id, unit_id, tenant_id, checkin_date, checkout_date,
          nights, price_per_night, cleaning_fee, total_amount, currency, status, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
       RETURNING *`,
      [
        dto.property_id, dto.unit_id, tenantId,
        dto.checkin_date, dto.checkout_date,
        nights, pricePerNight, cleaningFee, totalAmount, currency,
        ReservationStatus.CONFIRMED, dto.notes ?? null,
      ],
    );

    for (const date of nightDates) {
      await this.dataSource.query(
        `INSERT INTO property_availability (property_id, unit_id, date, status, reservation_id)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (unit_id, date) DO UPDATE SET status = $4, reservation_id = $5`,
        [dto.property_id, dto.unit_id, date, AvailabilityStatus.BOOKED, reservation.id],
      );
    }

    this.logger.log(`Reservation ${reservation.id} created for unit ${dto.unit_id} by tenant ${tenantId}`);
    return reservation;
  }

  // ─── Helpers privados ─────────────────────────────────────────────────────

  private async findUnitOrFail(propertyId: number, unitId: number): Promise<Record<string, string>> {
    const rows: Record<string, string>[] = await this.dataSource.query(
      `SELECT u.*, tc.rental_type AS tenant_rental_type
         FROM units u
         LEFT JOIN LATERAL (SELECT rental_type FROM tenant_config LIMIT 1) tc ON true
         WHERE u.id = $1 AND u.property_id = $2`,
      [unitId, propertyId],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Unidad ${unitId} no encontrada en la propiedad ${propertyId}`);
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

  private async findBookedDates(unitId: number, dates: string[]): Promise<string[]> {
    const rows: Array<{ date: string }> = await this.dataSource.query(
      `SELECT date::text FROM property_availability
       WHERE unit_id = $1 AND status = $2 AND date = ANY($3::date[])`,
      [unitId, AvailabilityStatus.BOOKED, dates],
    );
    return rows.map((r) => r.date);
  }

  private async assertDatesAvailable(unitId: number, dates: string[]): Promise<void> {
    const rows: Array<{ date: string; status: string }> = await this.dataSource.query(
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

  private assertDatesOrder(checkin: Date, checkout: Date): void {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    if (checkin < today) {
      throw new BadRequestException('La fecha de ingreso no puede ser en el pasado');
    }
    if (checkout <= checkin) {
      throw new BadRequestException('La fecha de salida debe ser posterior a la de ingreso');
    }
  }

  private assertNightsInRange(nights: number, unit: Record<string, string>): void {
    const minNights = unit.min_nights ? parseInt(unit.min_nights) : 1;
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

  private assertValidMonth(month: string): void {
    if (!/^\d{4}-\d{2}$/.test(month)) {
      throw new BadRequestException('El parámetro month debe tener formato YYYY-MM');
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
