import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { ApplicationQueriesService } from './application-queries.service';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';

@Injectable()
export class ApplicationStatusService {
  private readonly logger = new Logger(ApplicationStatusService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async updateStatus(
    id: number,
    updateDto: UpdateApplicationStatusDto,
    tenantSlug: string,
  ): Promise<ApplicationResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const application = await this.applicationQueriesService.findOne(
      id,
      tenantSlug,
    );

    const result = await this.dataSource.query<ApplicationResult[]>(
      `UPDATE ${schemaPrefix}rental_applications
       SET status = $1, admin_feedback = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [updateDto.status, updateDto.admin_feedback || null, id],
    );

    const normalizedRows = Array.isArray(result[0])
      ? (result[0] as unknown as ApplicationResult[])
      : result;
    const updatedApplication = normalizedRows[0];

    try {
      await this.notificationsService.createForUserInSchema(
        schemaName,
        Number(application.applicant_id),
        'application.status.changed' as NotificationEventType,
        'Actualización de tu solicitud',
        `Tu solicitud para la propiedad ${String(application.property_title)} ha cambiado a: ${String(updateDto.status)}`,
        {
          applicationId: id,
          status: updateDto.status,
          feedback: updateDto.admin_feedback,
        },
        tenantSlug,
      );
    } catch (error) {
      this.logger.error('Error al notificar al inquilino', error);
    }

    return updatedApplication;
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
