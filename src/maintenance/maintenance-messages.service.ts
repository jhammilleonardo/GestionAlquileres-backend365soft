import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateMessageDto } from './dto/create-message.dto';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { storageService } from '../common/storage/storage.service';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import type {
  IdRow,
  MaintenanceAttachmentRow,
  MaintenanceMessageRow,
  UserNameRow,
} from './maintenance.types';

@Injectable()
export class MaintenanceMessagesService {
  private readonly logger = new Logger(MaintenanceMessagesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly maintenanceLookupService: MaintenanceLookupService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async addMessage(
    requestId: number,
    createMessageDto: CreateMessageDto,
    userId: number,
  ): Promise<MaintenanceMessageRow> {
    const request = await this.maintenanceLookupService.findOne(requestId);

    const isTenant = request.tenant_id === userId;
    if (isTenant && ['COMPLETED', 'CLOSED'].includes(request.status)) {
      throw new ForbiddenException(
        'No puedes enviar mensajes en solicitudes terminadas o cerradas',
      );
    }

    const savedMessage = await runTenantTransaction(
      this.dataSource,
      async (queryRunner) => {
        const messageResult = this.asRows<MaintenanceMessageRow>(
          await queryRunner.query(
            `INSERT INTO maintenance_messages (maintenance_request_id, user_id, message, send_to_resident)
            VALUES ($1, $2, $3, $4)
            RETURNING *`,
            [
              requestId,
              userId,
              createMessageDto.message,
              createMessageDto.send_to_resident !== false,
            ],
          ),
        );

        const message = messageResult[0];
        if (!message) {
          throw new Error('No se pudo crear el mensaje de mantenimiento');
        }

        if (createMessageDto.files && createMessageDto.files.length > 0) {
          await this.linkMessageFiles(
            queryRunner,
            message.id,
            requestId,
            createMessageDto.files,
            userId,
          );
        }

        return message;
      },
    );

    await this.notifyMessageReceived(
      requestId,
      savedMessage.id,
      createMessageDto.message,
      userId,
    );

    return this.findMessageWithAttachments(savedMessage.id);
  }

  async saveUploadedFiles(
    requestId: number,
    files: Express.Multer.File[],
    userId: number,
    tenantSlug: string,
  ): Promise<MaintenanceAttachmentRow[]> {
    const savedFiles: MaintenanceAttachmentRow[] = [];

    for (const file of files) {
      const storagePath = await storageService.persistUploadedFile(
        file,
        storageService.buildStoragePath(
          'maintenance',
          tenantSlug,
          String(requestId),
          file.filename,
        ),
        'private',
      );
      const fileUrl = storageService.toRoutePath(storagePath);
      const fileType = this.getFileType(file.originalname);

      const result = await this.dataSource.query<MaintenanceAttachmentRow[]>(
        `INSERT INTO maintenance_attachments(
          maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *`,
        [requestId, fileUrl, file.originalname, fileType, file.size, userId],
      );

      savedFiles.push(result[0]);
    }

    return savedFiles;
  }

  private async linkMessageFiles(
    queryRunner: QueryRunner,
    messageId: number,
    requestId: number,
    files: string[],
    userId: number,
  ): Promise<void> {
    for (const fileUrl of files) {
      const updated = this.asRows<IdRow>(
        await queryRunner.query(
          `UPDATE maintenance_attachments SET message_id = $1
           WHERE file_url = $2 AND maintenance_request_id = $3
           RETURNING id`,
          [messageId, fileUrl, requestId],
        ),
      );

      if (!this.hasUpdatedAttachment(updated)) {
        await queryRunner.query(
          `INSERT INTO maintenance_attachments(
              message_id, maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [
            messageId,
            requestId,
            fileUrl,
            fileUrl.split('/').pop() || 'unknown',
            this.getFileType(fileUrl),
            0,
            userId,
          ],
        );
      }
    }
  }

  private async notifyMessageReceived(
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

  private async findMessageWithAttachments(
    messageId: number,
  ): Promise<MaintenanceMessageRow> {
    const messages = await this.dataSource.query<MaintenanceMessageRow[]>(
      `SELECT
        mm.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'file_url', ma.file_url,
              'file_name', ma.file_name,
              'file_type', ma.file_type,
              'created_at', ma.created_at
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM maintenance_messages mm
      LEFT JOIN maintenance_attachments ma ON ma.message_id = mm.id
      WHERE mm.id = $1
      GROUP BY mm.id`,
      [messageId],
    );

    if (!messages || messages.length === 0) {
      throw new NotFoundException('Mensaje no encontrado');
    }

    return messages[0];
  }

  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const pdfExts = ['pdf'];

    if (imageExts.includes(ext)) return 'image';
    if (pdfExts.includes(ext)) return 'pdf';
    return 'unknown';
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

  private asRows<T>(value: unknown): T[] {
    if (!Array.isArray(value)) {
      return [];
    }

    const rows: unknown = value[0];
    if (Array.isArray(rows)) {
      return rows as T[];
    }

    return value as T[];
  }

  private hasUpdatedAttachment(rows: IdRow[]): boolean {
    return rows.some((row) => Number.isInteger(row.id));
  }
}
