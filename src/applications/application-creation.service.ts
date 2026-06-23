import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { BlacklistService } from '../blacklist/blacklist.service';
import { DocumentType } from '../blacklist/enums/blacklist.enum';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ApplicationStatus } from './enums/application-status.enum';

interface BlacklistAlertInfo {
  is_blacklisted: boolean;
  reason: string | undefined;
  reported_by: string | undefined;
  message: string | undefined;
}

interface PropertyResult {
  id: number;
  title: string;
  status: string;
}

interface AdminUserRow {
  id: number | string;
}

@Injectable()
export class ApplicationCreationService {
  private readonly logger = new Logger(ApplicationCreationService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly blacklistService: BlacklistService,
    private readonly tenantsService: TenantsService,
  ) {}

  async create(
    createApplicationDto: CreateApplicationDto,
    userId: number,
    tenantSlug: string,
  ): Promise<ApplicationResult> {
    this.assertNoInlineDocuments(createApplicationDto);

    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    await this.ensureApplicantCanApply(userId, schemaPrefix);
    const property = await this.getAvailableProperty(
      createApplicationDto.property_id,
      schemaPrefix,
    );
    const blacklistAlert = await this.checkBlacklistAlert(
      createApplicationDto,
      userId,
      tenantSlug,
    );

    const application = await this.insertApplication(
      createApplicationDto,
      userId,
      schemaPrefix,
    );

    if (blacklistAlert) {
      application.blacklist_alert = blacklistAlert;
    }

    await this.notifyAdmins({
      application,
      blacklistAlert,
      property,
      schemaName,
      schemaPrefix,
      tenantSlug,
    });

    return application;
  }

  private assertNoInlineDocuments(dto: CreateApplicationDto): void {
    if (dto.documents && dto.documents.length > 0) {
      throw new BadRequestException(
        'Los documentos deben subirse desde el endpoint de documentos de la solicitud',
      );
    }
  }

  private async ensureApplicantCanApply(
    userId: number,
    schemaPrefix: string,
  ): Promise<void> {
    const userResult = await this.dataSource.query<{ role: string }[]>(
      `SELECT role FROM ${schemaPrefix}"user" WHERE id = $1`,
      [userId],
    );

    if (userResult.length === 0) {
      throw new NotFoundException(`Usuario con ID ${userId} no encontrado`);
    }

    if (userResult[0].role !== 'INQUILINO') {
      throw new BadRequestException(
        'Solo los inquilinos pueden enviar solicitudes de alquiler. ' +
          'Los administradores no pueden crear solicitudes.',
      );
    }
  }

  private async getAvailableProperty(
    propertyId: number,
    schemaPrefix: string,
  ): Promise<PropertyResult> {
    const propertyResult = await this.dataSource.query<PropertyResult[]>(
      `SELECT id, title, status FROM ${schemaPrefix}properties WHERE id = $1`,
      [propertyId],
    );

    if (propertyResult.length === 0) {
      throw new NotFoundException('La propiedad no existe');
    }

    const property = propertyResult[0];
    if (property.status !== 'DISPONIBLE') {
      throw new BadRequestException(
        'La propiedad no está disponible para alquiler',
      );
    }

    return property;
  }

  private async checkBlacklistAlert(
    createApplicationDto: CreateApplicationDto,
    userId: number,
    tenantSlug: string,
  ): Promise<BlacklistAlertInfo | null> {
    const documentNumber =
      createApplicationDto.personal_data?.identity_document;
    if (!documentNumber) {
      return null;
    }

    try {
      const checkResult = await this.blacklistService.checkBlacklist(
        {
          document_number: documentNumber,
          document_type: DocumentType.CEDULA,
        },
        tenantSlug,
        userId,
        undefined,
        undefined,
        true,
      );

      if (!checkResult.is_blacklisted) {
        return null;
      }

      this.logger.warn(
        `[BLACKLIST ALERT] Inquilino VETADO intenta aplicar: ${documentNumber} para propiedad ${createApplicationDto.property_id}`,
      );

      return {
        is_blacklisted: true,
        reason: checkResult.details?.reason,
        reported_by: checkResult.details?.reported_by_tenant_name,
        message: checkResult.message,
      };
    } catch (error) {
      this.logger.error('Error al verificar blacklist', error);
      return null;
    }
  }

  private async insertApplication(
    createApplicationDto: CreateApplicationDto,
    userId: number,
    schemaPrefix: string,
  ): Promise<ApplicationResult> {
    const result = await this.dataSource.query<ApplicationResult[]>(
      `INSERT INTO ${schemaPrefix}rental_applications
       (property_id, applicant_id, status, personal_data, employment_data, rental_history, "references", documents, additional_notes, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
       RETURNING *`,
      [
        createApplicationDto.property_id,
        userId,
        ApplicationStatus.PENDIENTE,
        JSON.stringify(createApplicationDto.personal_data),
        JSON.stringify(createApplicationDto.employment_data),
        JSON.stringify(createApplicationDto.rental_history),
        JSON.stringify(createApplicationDto.references),
        JSON.stringify(createApplicationDto.documents || []),
        createApplicationDto.additional_notes || null,
      ],
    );

    return result[0];
  }

  private async notifyAdmins(params: {
    application: ApplicationResult;
    blacklistAlert: BlacklistAlertInfo | null;
    property: PropertyResult;
    schemaName: string;
    schemaPrefix: string;
    tenantSlug: string;
  }): Promise<void> {
    try {
      const admins = await this.dataSource.query<AdminUserRow[]>(
        `SELECT id
         FROM ${params.schemaPrefix}"user"
         WHERE role = 'ADMIN' AND is_active = true`,
      );
      const adminIds = admins.map((admin) => Number(admin.id));

      if (adminIds.length === 0) {
        return;
      }

      const title = params.blacklistAlert
        ? '⚠️ ALERTA: Solicitud de inquilino VETADO'
        : 'Nueva solicitud de alquiler';

      const description = params.blacklistAlert
        ? `⚠️ ALERTA: Inquilino en lista negra - ${params.blacklistAlert.reason} (reportado por: ${params.blacklistAlert.reported_by}). Solicitud para propiedad: ${String(params.property.title)}`
        : `Se ha recibido una nueva solicitud para la propiedad: ${String(params.property.title)}`;

      await Promise.all(
        adminIds.map((adminId) =>
          this.notificationsService.createForUserInSchema(
            params.schemaName,
            adminId,
            'application.created' as NotificationEventType,
            title,
            description,
            {
              applicationId: Number(params.application.id),
              propertyId: Number(params.property.id),
              blacklist_alert: params.blacklistAlert,
            },
            params.tenantSlug,
          ),
        ),
      );
    } catch (error) {
      this.logger.error('Error al notificar admins', error);
    }
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
