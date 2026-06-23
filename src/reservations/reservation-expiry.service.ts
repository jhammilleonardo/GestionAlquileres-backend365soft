import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { ReservationNotificationService } from './reservation-notification.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

interface ActiveTenant {
  schema_name: string;
  slug: string;
}

interface ExpiredReservation {
  id: number;
  tenant_id: number | null;
}

/**
 * Expira solicitudes y retenciones de pago vencidas, liberando sus noches.
 */
@Injectable()
export class ReservationExpiryService {
  private readonly logger = new Logger(ReservationExpiryService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationService: ReservationNotificationService,
  ) {}

  async expireStalePendingReservations(): Promise<number> {
    const tenants = await this.getActiveTenantSchemas();
    let totalExpired = 0;

    for (const tenant of tenants) {
      try {
        const expired = await this.expireForSchema(tenant.schema_name);
        totalExpired += expired.length;
        await this.notifyExpired(tenant, expired);
      } catch (error) {
        this.logger.error(
          `Fallo al expirar reservas en ${tenant.schema_name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    if (totalExpired > 0) {
      this.logger.log(`Reservas expiradas en este ciclo: ${totalExpired}`);
    }
    return totalExpired;
  }

  private async notifyExpired(
    tenant: ActiveTenant,
    expired: ExpiredReservation[],
  ): Promise<void> {
    await Promise.all(
      expired.map((reservation) =>
        this.notificationService.notifyGuest(
          tenant.schema_name,
          reservation.tenant_id,
          NotificationEventType.RESERVATION_EXPIRED,
          reservation.id,
          tenant.slug,
        ),
      ),
    );
  }

  /**
   * Marca como EXPIRED las reservas vencidas y libera sus noches en una
   * sola sentencia con CTE (atómica): el UPDATE de disponibilidad sólo afecta a
   * las filas de las reservas recién expiradas.
   */
  private async expireForSchema(
    schemaName: string,
  ): Promise<ExpiredReservation[]> {
    const q = quoteIdent(schemaName);
    const expired = await this.dataSource.query<
      Array<{ id: number; tenant_id: number | null }>
    >(
      `
      WITH expired AS (
        UPDATE ${q}.reservations
           SET status = 'expired', updated_at = NOW()
         WHERE status IN ('pending', 'pending_payment')
           AND COALESCE(expires_at, created_at + INTERVAL '24 hours') <= NOW()
        RETURNING id, tenant_id
      ),
      released AS (
        UPDATE ${q}.property_availability pa
           SET status = 'available', reservation_id = NULL
          FROM expired e
         WHERE pa.reservation_id = e.id
           AND pa.status = 'booked'
      )
      SELECT id, tenant_id FROM expired
      `,
    );

    return this.dedupeById(expired);
  }

  /**
   * Una reserva puede aparecer repetida si abarca varias noches; se cuenta y
   * notifica una sola vez por reserva.
   */
  private dedupeById(rows: ExpiredReservation[]): ExpiredReservation[] {
    const unique = new Map<number, ExpiredReservation>();
    for (const row of rows) {
      if (!unique.has(row.id)) {
        unique.set(row.id, row);
      }
    }
    return Array.from(unique.values());
  }

  private async getActiveTenantSchemas(): Promise<ActiveTenant[]> {
    return this.dataSource.query<ActiveTenant[]>(
      `SELECT t.schema_name, t.slug
         FROM public.tenant t
        WHERE t.is_active = true
          AND EXISTS (
            SELECT 1 FROM information_schema.tables tb
            WHERE tb.table_schema = t.schema_name
              AND tb.table_name = 'reservations'
          )`,
    );
  }
}
