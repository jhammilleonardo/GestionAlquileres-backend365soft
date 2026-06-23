import {
  Injectable,
  Logger,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { computeDepositPaid } from './cancellation-policy';
import { ListReservationsDto } from './dto/list-reservations.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { AvailabilityStatus } from './enums/availability-status.enum';
import { ReservationStatus } from './enums/reservation-status.enum';
import {
  ReservationAction,
  RESERVATION_TRANSITIONS,
} from './enums/reservation-action.enum';
import { ReservationRow } from './reservations.service';
import { applyTenantSearchPath } from '../common/tenant/tenant-search-path';
import { ReservationNotificationService } from './reservation-notification.service';
import { ReservationRefundService } from './reservation-refund.service';
import { HousekeepingService } from './housekeeping.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

export interface ReservationListItem extends ReservationRow {
  property_name: string | null;
  unit_number: string | null;
  tenant_name: string | null;
}

export interface PaginatedReservations {
  data: ReservationListItem[];
  total: number;
  page: number;
  limit: number;
}

/**
 * Gestión administrativa de reservas (lista, detalle y transiciones de estado).
 * Separado de ReservationsService (SRP): éste opera el ciclo de vida desde el
 * back-office; aquél maneja catálogo público y creación por el inquilino.
 */
@Injectable()
export class ReservationsAdminService {
  private readonly logger = new Logger(ReservationsAdminService.name);

  /** Acciones admin que reembolsan al huésped (decisión del host → 100%). */
  private static readonly FULL_REFUND_ACTIONS: readonly ReservationAction[] = [
    ReservationAction.CANCEL,
    ReservationAction.DECLINE,
  ];

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationService: ReservationNotificationService,
    private readonly refundService: ReservationRefundService,
    private readonly housekeepingService: HousekeepingService,
  ) {}

  async findAll(filters: ListReservationsDto): Promise<PaginatedReservations> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    const { whereClause, params } = this.buildFilters(filters);

    const totalRows: Array<{ count: string }> = await this.dataSource.query(
      `SELECT COUNT(*)::text AS count FROM reservations r ${whereClause}`,
      params,
    );
    const total = parseInt(totalRows[0]?.count ?? '0', 10);

    const data: ReservationListItem[] = await this.dataSource.query(
      `SELECT r.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              t.name        AS tenant_name
         FROM reservations r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
         LEFT JOIN "user"   t   ON t.id = r.tenant_id
         ${whereClause}
         ORDER BY r.checkin_date DESC, r.id DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset],
    );

    return { data, total, page, limit };
  }

  async findOne(id: number): Promise<ReservationListItem> {
    const rows: ReservationListItem[] = await this.dataSource.query(
      `SELECT r.*,
              p.title        AS property_name,
              u.unit_number AS unit_number,
              t.name        AS tenant_name
         FROM reservations r
         LEFT JOIN properties p ON p.id = r.property_id
         LEFT JOIN units u      ON u.id = r.unit_id
         LEFT JOIN "user"   t   ON t.id = r.tenant_id
         WHERE r.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Reserva ${id} no encontrada`);
    }
    return rows[0];
  }

  /**
   * Aplica una transición de estado validada por la máquina de estados. Si la
   * transición libera ocupación (cancel/decline/no-show), las noches vuelven a
   * `available` en la misma transacción para que la unidad sea re-reservable.
   */
  async transition(
    id: number,
    dto: UpdateReservationStatusDto,
    adminUserId: number,
    schemaName?: string,
    tenantSlug?: string,
  ): Promise<ReservationListItem> {
    const transition = RESERVATION_TRANSITIONS[dto.action];

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await applyTenantSearchPath(queryRunner);
    await queryRunner.startTransaction();

    try {
      // Bloqueo de fila: evita transiciones concurrentes sobre la misma reserva.
      const current = (await queryRunner.query(
        `SELECT id, status, property_id, unit_id, checkout_date::text AS checkout_date,
                total_amount, security_deposit,
                COALESCE((
                  SELECT SUM(amount) FROM payments
                   WHERE reservation_id = reservations.id AND status = 'APPROVED'
                ), 0)::text AS approved_paid
           FROM reservations WHERE id = $1 FOR UPDATE`,
        [id],
      )) as Array<{
        id: number;
        status: ReservationStatus;
        property_id: number;
        unit_id: number;
        checkout_date: string;
        total_amount: string;
        security_deposit: string;
        approved_paid: string;
      }>;

      if (current.length === 0) {
        throw new NotFoundException(`Reserva ${id} no encontrada`);
      }

      const fromStatus = current[0].status;
      if (!transition.from.includes(fromStatus)) {
        throw new ConflictException(
          `No se puede '${dto.action}' una reserva en estado '${fromStatus}'. Estados válidos: ${transition.from.join(', ')}.`,
        );
      }

      await queryRunner.query(
        `UPDATE reservations
            SET status = $1, updated_at = NOW()
          WHERE id = $2`,
        [transition.to, id],
      );

      if (transition.releasesAvailability) {
        await queryRunner.query(
          `UPDATE property_availability
              SET status = $1, reservation_id = NULL
            WHERE reservation_id = $2 AND status = $3`,
          [AvailabilityStatus.AVAILABLE, id, AvailabilityStatus.BOOKED],
        );
      }

      await this.applyRefundForAction(
        queryRunner,
        id,
        dto.action,
        current[0],
        adminUserId,
      );

      // Al completar, se programa la limpieza para la fecha de salida.
      if (dto.action === ReservationAction.COMPLETE) {
        await this.housekeepingService.createForReservation(queryRunner, {
          id,
          property_id: current[0].property_id,
          unit_id: current[0].unit_id,
          checkout_date: current[0].checkout_date,
        });
      }

      await queryRunner.commitTransaction();

      this.logger.log(
        `Admin ${adminUserId} applied '${dto.action}' to reservation ${id}: ${fromStatus} → ${transition.to}`,
      );
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const result = await this.findOne(id);

    // Avisa al huésped el desenlace de su solicitud (best-effort).
    if (schemaName) {
      await this.notifyGuestOfOutcome(
        schemaName,
        dto.action,
        result,
        tenantSlug,
      );
    }

    return result;
  }

  /**
   * Aplica el reembolso correspondiente a la acción admin:
   *   - CANCEL/DECLINE → reembolso íntegro (decisión del host; incluye depósito);
   *   - COMPLETE       → devuelve sólo el depósito retenido (el alquiler se gana);
   *   - NO_SHOW        → sin reembolso (ausencia del huésped).
   */
  private async applyRefundForAction(
    queryRunner: QueryRunner,
    id: number,
    action: ReservationAction,
    row: {
      total_amount: string;
      security_deposit: string;
      approved_paid: string;
    },
    adminUserId: number,
  ): Promise<void> {
    if (ReservationsAdminService.FULL_REFUND_ACTIONS.includes(action)) {
      await this.refundService.refundApprovedPayments(
        queryRunner,
        id,
        100,
        adminUserId,
      );
      return;
    }

    if (action === ReservationAction.COMPLETE) {
      const deposit = Number(row.security_deposit);
      const rentPortion = Number(row.total_amount) - deposit;
      const depositPaid = computeDepositPaid(
        Number(row.approved_paid),
        rentPortion,
      );
      await this.refundService.refundAbsoluteAmount(
        queryRunner,
        id,
        depositPaid,
        adminUserId,
        'security_deposit_return',
      );
    }
  }

  /** Mapea la acción admin a la notificación al huésped (confirmar/rechazar). */
  private async notifyGuestOfOutcome(
    schemaName: string,
    action: ReservationAction,
    reservation: ReservationListItem,
    tenantSlug?: string,
  ): Promise<void> {
    const eventType =
      action === ReservationAction.CONFIRM
        ? NotificationEventType.RESERVATION_CONFIRMED
        : action === ReservationAction.DECLINE
          ? NotificationEventType.RESERVATION_DECLINED
          : null;

    if (!eventType) return;

    await this.notificationService.notifyGuest(
      schemaName,
      reservation.tenant_id,
      eventType,
      reservation.id,
      tenantSlug,
    );
  }

  private buildFilters(filters: ListReservationsDto): {
    whereClause: string;
    params: unknown[];
  } {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filters.status) {
      params.push(filters.status);
      conditions.push(`r.status = $${params.length}`);
    }
    if (filters.property_id !== undefined) {
      params.push(filters.property_id);
      conditions.push(`r.property_id = $${params.length}`);
    }
    if (filters.unit_id !== undefined) {
      params.push(filters.unit_id);
      conditions.push(`r.unit_id = $${params.length}`);
    }
    if (filters.checkin_from) {
      params.push(filters.checkin_from);
      conditions.push(`r.checkin_date >= $${params.length}::date`);
    }
    if (filters.checkin_to) {
      params.push(filters.checkin_to);
      conditions.push(`r.checkin_date <= $${params.length}::date`);
    }

    const whereClause =
      conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    return { whereClause, params };
  }
}
