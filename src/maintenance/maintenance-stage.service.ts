import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { storageService } from '../common/storage/storage.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import {
  MaintenanceStage,
  STAGE_ORDER,
  TECHNICIAN_ALLOWED_TARGET_STAGES,
} from './enums/maintenance-stage.enum';
import type {
  IdRow,
  MaintenanceRequestRow,
  MaintenanceStageHistoryRow,
} from './maintenance.types';

@Injectable()
export class MaintenanceStageService {
  private readonly logger = new Logger(MaintenanceStageService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly maintenanceLookupService: MaintenanceLookupService,
  ) {}

  isValidStageTransition(from: string, to: string): boolean {
    if (!this.isMaintenanceStage(from) || !this.isMaintenanceStage(to)) {
      return false;
    }
    const fromIndex = STAGE_ORDER.indexOf(from);
    const toIndex = STAGE_ORDER.indexOf(to);
    if (fromIndex === -1 || toIndex === -1) return false;
    return toIndex === fromIndex + 1;
  }

  isTechnicianAllowedTarget(toStage: string): boolean {
    return (
      this.isMaintenanceStage(toStage) &&
      TECHNICIAN_ALLOWED_TARGET_STAGES.includes(toStage)
    );
  }

  async getStageHistory(
    requestId: number,
  ): Promise<MaintenanceStageHistoryRow[]> {
    return this.dataSource.query<MaintenanceStageHistoryRow[]>(
      `SELECT msh.*, u.name AS changed_by_name
       FROM maintenance_stage_history msh
       LEFT JOIN "user" u ON u.id = msh.changed_by_user_id
       WHERE msh.request_id = $1
       ORDER BY msh.created_at ASC`,
      [requestId],
    );
  }

  async changeStage(
    requestId: number,
    toStage: string,
    userId: number,
    notes?: string,
  ): Promise<MaintenanceRequestRow> {
    const request = await this.maintenanceLookupService.findOne(requestId);
    const fromStage = request.current_stage ?? 'REPORTED';

    if (!this.isValidStageTransition(fromStage, toStage)) {
      throw new BadRequestException(
        `Transición inválida: ${fromStage} → ${toStage}. Solo se permite avanzar una etapa a la vez.`,
      );
    }
    const targetStage = toStage as MaintenanceStage;

    if (targetStage === MaintenanceStage.IN_PROGRESS) {
      await this.validateBoliviaAuthorization(requestId, request);
    }

    const completedAtClause =
      targetStage === MaintenanceStage.COMPLETED
        ? `, completed_at = NOW()`
        : '';

    await this.dataSource.query(
      `UPDATE maintenance_requests
       SET current_stage = $1${completedAtClause}, updated_at = NOW()
       WHERE id = $2`,
      [targetStage, requestId],
    );

    await this.dataSource.query(
      `INSERT INTO maintenance_stage_history
         (request_id, from_stage, to_stage, changed_by_user_id, notes, photos)
       VALUES ($1, $2, $3, $4, $5, '[]')`,
      [requestId, fromStage, targetStage, userId, notes ?? null],
    );

    if (targetStage === MaintenanceStage.COMPLETED) {
      await this.notifyCompletedStage(requestId, request);
    }

    return this.maintenanceLookupService.findOne(requestId);
  }

  async changeStageAsTechnician(
    requestId: number,
    toStage: string,
    userId: number,
    notes?: string,
  ): Promise<MaintenanceRequestRow> {
    if (!this.isTechnicianAllowedTarget(toStage)) {
      throw new BadRequestException(
        `Los técnicos solo pueden avanzar a IN_PROGRESS o COMPLETED. Etapa solicitada: ${toStage}`,
      );
    }
    return this.changeStage(requestId, toStage, userId, notes);
  }

  async saveStagePhotos(
    requestId: number,
    files: Express.Multer.File[],
    userId: number,
    slug: string,
  ): Promise<Array<{ file_url: string }>> {
    const photoUrls: string[] = [];

    for (const file of files) {
      const storagePath = await storageService.persistUploadedFile(
        file,
        storageService.buildStoragePath(
          'maintenance',
          slug,
          String(requestId),
          'stage',
          file.filename,
        ),
        'private',
      );
      const fileUrl = storageService.toRoutePath(storagePath);
      await this.dataSource.query(
        `INSERT INTO maintenance_attachments
           (maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [requestId, fileUrl, file.originalname, 'image', file.size, userId],
      );
      photoUrls.push(fileUrl);
    }

    if (photoUrls.length > 0) {
      await this.dataSource.query(
        `UPDATE maintenance_stage_history
         SET photos = photos || $1::jsonb
         WHERE id = (
           SELECT id FROM maintenance_stage_history
           WHERE request_id = $2
           ORDER BY created_at DESC
           LIMIT 1
         )`,
        [JSON.stringify(photoUrls), requestId],
      );
    }

    return photoUrls.map((url) => ({ file_url: url }));
  }

  async authorizeWork(requestId: number, ownerId: number): Promise<void> {
    await this.maintenanceLookupService.findOne(requestId);

    await this.dataSource.query(
      `UPDATE maintenance_requests
       SET owner_authorized = TRUE, updated_at = NOW()
       WHERE id = $1`,
      [requestId],
    );

    this.logger.log(
      `Mantenimiento ${requestId} autorizado por propietario ${ownerId}`,
    );
  }

  private async validateBoliviaAuthorization(
    requestId: number,
    request: MaintenanceRequestRow,
  ): Promise<void> {
    let country = 'XX';
    try {
      const config = await this.dataSource.query<Array<{ country: string }>>(
        `SELECT country FROM tenant_config LIMIT 1`,
      );
      country = config[0]?.country ?? 'XX';
    } catch {
      return;
    }

    if (country === 'BO' && !request.owner_authorized) {
      throw new BadRequestException(
        `El propietario debe autorizar el gasto antes de iniciar el trabajo (requerido en Bolivia). Use PATCH /:slug/owner/maintenance/${requestId}/authorize`,
      );
    }
  }

  private async notifyCompletedStage(
    requestId: number,
    request: MaintenanceRequestRow,
  ): Promise<void> {
    try {
      const history = await this.dataSource.query<Array<{ photos: string[] }>>(
        `SELECT photos FROM maintenance_stage_history
         WHERE request_id = $1 AND to_stage = 'COMPLETED'
         ORDER BY created_at DESC LIMIT 1`,
        [requestId],
      );

      const photos: string[] = history[0]?.photos ?? [];
      const completedAt = new Date().toISOString();

      const admins = await this.dataSource.query<IdRow[]>(
        `SELECT id FROM "user" WHERE role = 'ADMIN'`,
      );

      for (const admin of admins) {
        await this.notificationsService.createForUser(
          admin.id,
          NotificationEventType.MAINTENANCE_COMPLETED,
          'Mantenimiento completado',
          `La solicitud ${request.ticket_number} ha sido completada por el técnico.`,
          {
            ticket_number: request.ticket_number,
            maintenance_request_id: requestId,
            property_id: request.property_id,
            completed_at: completedAt,
            photos,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error al notificar COMPLETED para solicitud ${requestId}: ${this.getErrorMessage(error)}`,
        this.getErrorStack(error),
      );
    }
  }

  private isMaintenanceStage(stage: string): stage is MaintenanceStage {
    return STAGE_ORDER.includes(stage as MaintenanceStage);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }
}
