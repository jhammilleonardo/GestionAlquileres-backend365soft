import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import type { UserNameRow } from './maintenance.types';

@Injectable()
export class MaintenanceMessageNotificationsService {
  private readonly logger = new Logger(
    MaintenanceMessageNotificationsService.name,
  );

  constructor(
    private readonly dataSource: DataSource,
    private readonly maintenanceLookupService: MaintenanceLookupService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async notifyMessageReceived(
    requestId: number,
    messageId: number,
    message: string,
    userId: number,
  ): Promise<void> {
    try {
      const request = await this.maintenanceLookupService.findOne(requestId);
      const isFromTenant = request.tenant_id === userId;
      const senderName = await this.getUserName(userId);
      const messagePreview =
        message.length > 100 ? `${message.substring(0, 100)}...` : message;

      if (isFromTenant) {
        if (request.assigned_to) {
          await this.notificationsService.createForUser(
            request.assigned_to,
            NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED,
            'Nuevo mensaje en solicitud',
            `${senderName} respondió a la solicitud ${request.ticket_number}: ${messagePreview}`,
            {
              ticket_number: request.ticket_number,
              maintenance_request_id: requestId,
              sender_name: senderName,
              sender_id: userId,
              message_preview: messagePreview,
              is_from_admin: false,
            },
          );
        } else {
          this.logger.warn(
            `Mensaje de mantenimiento ${messageId} sin usuario asignado para notificar`,
          );
        }
      } else {
        await this.notificationsService.createForUser(
          request.tenant_id,
          NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED,
          'Nuevo mensaje en solicitud',
          `${senderName} respondió a tu solicitud ${request.ticket_number}: ${messagePreview}`,
          {
            ticket_number: request.ticket_number,
            maintenance_request_id: requestId,
            sender_name: senderName,
            sender_id: userId,
            message_preview: messagePreview,
            is_from_admin: true,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error al crear notificacion de mensaje de mantenimiento: ${this.getErrorMessage(error)}`,
        this.getErrorStack(error),
      );
    }
  }

  private async getUserName(userId: number): Promise<string> {
    try {
      const result = await this.dataSource.query<UserNameRow[]>(
        `SELECT name FROM "user" WHERE id = $1`,
        [userId],
      );
      return result[0]?.name || 'Usuario';
    } catch {
      return 'Usuario';
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }
}
