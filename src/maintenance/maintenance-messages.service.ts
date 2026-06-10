import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateMessageDto } from './dto/create-message.dto';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { StorageService } from '../common/storage/storage.service';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import { MaintenanceMessageNotificationsService } from './maintenance-message-notifications.service';
import type {
  IdRow,
  MaintenanceAttachmentRow,
  MaintenanceMessageRow,
} from './maintenance.types';

@Injectable()
export class MaintenanceMessagesService {
  private readonly logger = new Logger(MaintenanceMessagesService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly maintenanceLookupService: MaintenanceLookupService,
    private readonly storageService: StorageService,
    private readonly maintenanceMessageNotificationsService: MaintenanceMessageNotificationsService,
  ) {}

  async addMessage(
    requestId: number,
    createMessageDto: CreateMessageDto,
    userId: number,
  ): Promise<MaintenanceMessageRow> {
    const message = createMessageDto.message.trim();
    const hasFiles = (createMessageDto.files?.length ?? 0) > 0;

    if (!message && !hasFiles) {
      throw new BadRequestException('El mensaje o adjunto es obligatorio');
    }

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
              message,
              createMessageDto.send_to_resident !== false,
            ],
          ),
        );

        const savedMessage = messageResult[0];
        if (!savedMessage) {
          throw new Error('No se pudo crear el mensaje de mantenimiento');
        }

        if (createMessageDto.files && createMessageDto.files.length > 0) {
          await this.linkMessageFiles(
            queryRunner,
            savedMessage.id,
            requestId,
            createMessageDto.files,
            userId,
          );
        }

        return savedMessage;
      },
    );

    await this.maintenanceMessageNotificationsService.notifyMessageReceived(
      requestId,
      savedMessage.id,
      message,
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
    const storedPaths: string[] = [];

    try {
      return await runTenantTransaction(
        this.dataSource,
        async (queryRunner) => {
          for (const file of files) {
            const storagePath = await this.storageService.persistUploadedFile(
              file,
              this.storageService.buildStoragePath(
                'maintenance',
                tenantSlug,
                String(requestId),
                file.filename,
              ),
              'private',
            );
            storedPaths.push(storagePath);

            const fileUrl = this.storageService.toRoutePath(storagePath);
            const fileType = this.getFileType(file.originalname);

            const result = (await queryRunner.query(
              `INSERT INTO maintenance_attachments(
              maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by
            ) VALUES ($1, $2, $3, $4, $5, $6)
            RETURNING *`,
              [
                requestId,
                fileUrl,
                file.originalname,
                fileType,
                file.size,
                userId,
              ],
            )) as MaintenanceAttachmentRow[];

            savedFiles.push(result[0]);
          }

          return savedFiles;
        },
      );
    } catch (error) {
      await this.deleteStoredFilesSafely(storedPaths);
      throw error;
    }
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

  private async findMessageWithAttachments(
    messageId: number,
  ): Promise<MaintenanceMessageRow> {
    const messages = await this.dataSource.query<MaintenanceMessageRow[]>(
      `SELECT
        mm.*,
        u.name AS sender_name,
        u.role AS sender_role,
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
      LEFT JOIN "user" u ON u.id = mm.user_id
      WHERE mm.id = $1
      GROUP BY mm.id, u.name, u.role`,
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

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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

  private async deleteStoredFilesSafely(storagePaths: string[]): Promise<void> {
    await Promise.all(
      storagePaths.map((storagePath) =>
        this.storageService.deleteStoredFile(storagePath).catch((error) => {
          this.logger.warn(
            `No se pudo compensar archivo de mantenimiento '${storagePath}': ${this.getErrorMessage(error)}`,
          );
        }),
      ),
    );
  }
}
