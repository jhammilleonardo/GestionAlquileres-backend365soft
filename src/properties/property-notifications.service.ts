import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';

export interface PropertyStatusSnapshot {
  id: number;
  title: string;
  status: string;
}

interface AdminIdRow {
  id: number;
}

@Injectable()
export class PropertyNotificationsService {
  private readonly logger = new Logger(PropertyNotificationsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
  ) {}

  async notifyStatusChange(
    property: PropertyStatusSnapshot,
    newStatus: string,
    schemaName: string | null,
    tenantSlug?: string,
  ): Promise<void> {
    try {
      const adminQuery = schemaName
        ? `SELECT id FROM ${quoteIdent(schemaName)}."user" WHERE role = 'ADMIN'`
        : `SELECT id FROM "user" WHERE role = 'ADMIN'`;
      const admins = await this.dataSource.query<AdminIdRow[]>(adminQuery);
      const eventType =
        newStatus === 'DISPONIBLE'
          ? NotificationEventType.PROPERTY_AVAILABLE
          : NotificationEventType.PROPERTY_STATUS_CHANGED;
      const title =
        newStatus === 'DISPONIBLE'
          ? 'Propiedad disponible'
          : 'Estado de propiedad actualizado';
      const message =
        newStatus === 'DISPONIBLE'
          ? `La propiedad ${property.title} ahora está disponible`
          : `La propiedad ${property.title} ha cambiado de ${property.status} a ${newStatus}`;
      const metadata = {
        property_id: property.id,
        property_title: property.title,
        old_status: property.status,
        new_status: newStatus,
      };

      for (const admin of admins) {
        if (schemaName) {
          await this.notificationsService.createForUserInSchema(
            schemaName,
            admin.id,
            eventType,
            title,
            message,
            metadata,
            tenantSlug,
          );
          continue;
        }

        await this.notificationsService.createForUser(
          admin.id,
          eventType,
          title,
          message,
          metadata,
          tenantSlug,
        );
      }
    } catch (error) {
      // No fallar si la notificación no se puede crear
      this.logger.error(
        'Error al crear notificación de estado de propiedad',
        error instanceof Error ? error.stack : undefined,
      );
    }
  }
}
