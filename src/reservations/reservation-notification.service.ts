import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';

/**
 * Notificaciones del ciclo OTA de reservas. Aislada (SRP) y siempre best-effort:
 * un fallo al notificar nunca debe abortar la reserva ni su transición, por eso
 * cada método captura y loggea sin propagar.
 */
@Injectable()
export class ReservationNotificationService {
  private readonly logger = new Logger(ReservationNotificationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  /** Avisa a los admins que hay una solicitud de reserva (request-to-book) por confirmar. */
  async notifyAdminsOfRequest(
    schemaName: string,
    reservation: { id: number; checkin_date: string; checkout_date: string },
    tenantSlug?: string,
  ): Promise<void> {
    try {
      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM ${quoteIdent(schemaName)}."user"
          WHERE role = 'ADMIN' AND is_active = true LIMIT 5`,
      );

      await Promise.all(
        admins.map((admin) =>
          this.notificationsService.createForUserInSchema(
            schemaName,
            admin.id,
            NotificationEventType.RESERVATION_REQUESTED,
            'Nueva solicitud de reserva',
            `Una reserva (${reservation.checkin_date} → ${reservation.checkout_date}) espera tu confirmación.`,
            { reservation_id: reservation.id },
            tenantSlug,
          ),
        ),
      );
    } catch (error) {
      this.logBestEffort('solicitud a admins', reservation.id, error);
    }
  }

  /** Notifica al huésped el resultado de su reserva (confirmada/rechazada/expirada). */
  async notifyGuest(
    schemaName: string,
    guestUserId: number | null | undefined,
    eventType:
      | NotificationEventType.RESERVATION_CONFIRMED
      | NotificationEventType.RESERVATION_DECLINED
      | NotificationEventType.RESERVATION_EXPIRED,
    reservationId: number,
    tenantSlug?: string,
  ): Promise<void> {
    const normalizedGuestUserId =
      typeof guestUserId === 'number' ? guestUserId : Number.NaN;

    if (
      !Number.isInteger(normalizedGuestUserId) ||
      normalizedGuestUserId <= 0
    ) {
      this.logger.warn(
        `No se pudo notificar (aviso al huésped) reserva ${reservationId}: huésped inválido`,
      );
      return;
    }

    const copy = this.guestCopy(eventType);
    try {
      await this.notificationsService.createForUserInSchema(
        schemaName,
        normalizedGuestUserId,
        eventType,
        copy.title,
        copy.message,
        { reservation_id: reservationId },
        tenantSlug,
      );
    } catch (error) {
      this.logBestEffort('aviso al huésped', reservationId, error);
    }
  }

  private guestCopy(eventType: NotificationEventType): {
    title: string;
    message: string;
  } {
    switch (eventType) {
      case NotificationEventType.RESERVATION_CONFIRMED:
        return {
          title: 'Reserva confirmada',
          message: 'Tu reserva fue confirmada. ¡Te esperamos!',
        };
      case NotificationEventType.RESERVATION_DECLINED:
        return {
          title: 'Reserva rechazada',
          message: 'Lamentablemente tu solicitud de reserva fue rechazada.',
        };
      default:
        return {
          title: 'Reserva expirada',
          message:
            'Tu solicitud de reserva expiró sin confirmarse y las fechas se liberaron.',
        };
    }
  }

  private logBestEffort(context: string, id: number, error: unknown): void {
    this.logger.warn(
      `No se pudo notificar (${context}) reserva ${id}: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}
