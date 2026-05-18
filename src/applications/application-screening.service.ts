import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationStatusService } from './application-status.service';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { ScreeningFinalStatus } from './enums/screening-final-status.enum';

export interface ScreeningChecklistRow {
  id: number;
  application_id: number;
  documents_verified: boolean;
  employer_call_name: string | null;
  employer_call_phone: string | null;
  employer_call_result: string | null;
  previous_landlord_name: string | null;
  previous_landlord_phone: string | null;
  previous_landlord_result: string | null;
  blacklist_checked: boolean;
  blacklist_result: string | null;
  notes: string | null;
  final_status: ScreeningFinalStatus | null;
  reviewed_by: number | null;
  reviewed_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface ApplicationScreeningResult {
  message: string;
  screening: ScreeningChecklistRow;
  contract?: Record<string, unknown>;
}

@Injectable()
export class ApplicationScreeningService {
  private readonly logger = new Logger(ApplicationScreeningService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly applicationStatusService: ApplicationStatusService,
    private readonly applicationApprovalService: ApplicationApprovalService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async completeScreening(
    id: number,
    dto: UpdateScreeningDto,
    adminId: number,
    tenantSlug: string,
  ): Promise<ApplicationScreeningResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const application = await this.applicationQueriesService.findOne(
      id,
      tenantSlug,
    );

    const checklist = await this.upsertChecklist({
      id,
      dto,
      adminId,
      schemaPrefix,
    });

    if (!dto.final_status) {
      return {
        message: 'Checklist de screening actualizado',
        screening: checklist,
      };
    }

    if (dto.final_status === ScreeningFinalStatus.APPROVED) {
      return this.handleScreeningApproved(
        id,
        dto,
        adminId,
        checklist,
        tenantSlug,
      );
    }

    if (dto.final_status === ScreeningFinalStatus.REJECTED) {
      return this.handleScreeningRejected(
        id,
        dto,
        application,
        checklist,
        tenantSlug,
      );
    }

    return this.handleScreeningRequiresCosigner(
      id,
      dto,
      application,
      checklist,
      tenantSlug,
    );
  }

  private async upsertChecklist(params: {
    id: number;
    dto: UpdateScreeningDto;
    adminId: number;
    schemaPrefix: string;
  }): Promise<ScreeningChecklistRow> {
    const now = params.dto.final_status ? new Date() : null;
    const [existing] = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM ${params.schemaPrefix}screening_checklist WHERE application_id = $1`,
      [params.id],
    );

    if (existing) {
      const [updated] = await this.dataSource.query<ScreeningChecklistRow[]>(
        `UPDATE ${params.schemaPrefix}screening_checklist SET
          documents_verified   = COALESCE($1, documents_verified),
          employer_call_name   = COALESCE($2, employer_call_name),
          employer_call_phone  = COALESCE($3, employer_call_phone),
          employer_call_result = COALESCE($4, employer_call_result),
          previous_landlord_name   = COALESCE($5, previous_landlord_name),
          previous_landlord_phone  = COALESCE($6, previous_landlord_phone),
          previous_landlord_result = COALESCE($7, previous_landlord_result),
          blacklist_checked    = COALESCE($8, blacklist_checked),
          blacklist_result     = COALESCE($9, blacklist_result),
          notes                = COALESCE($10, notes),
          final_status         = COALESCE($11, final_status),
          reviewed_by          = COALESCE($12, reviewed_by),
          reviewed_at          = COALESCE($13, reviewed_at),
          updated_at           = NOW()
        WHERE application_id = $14
        RETURNING *`,
        [
          params.dto.documents_verified ?? null,
          params.dto.employer_call_name ?? null,
          params.dto.employer_call_phone ?? null,
          params.dto.employer_call_result ?? null,
          params.dto.previous_landlord_name ?? null,
          params.dto.previous_landlord_phone ?? null,
          params.dto.previous_landlord_result ?? null,
          params.dto.blacklist_checked ?? null,
          params.dto.blacklist_result ?? null,
          params.dto.notes ?? null,
          params.dto.final_status ?? null,
          params.dto.final_status ? params.adminId : null,
          now,
          params.id,
        ],
      );

      return updated;
    }

    const [created] = await this.dataSource.query<ScreeningChecklistRow[]>(
      `INSERT INTO ${params.schemaPrefix}screening_checklist (
        application_id, documents_verified, employer_call_name, employer_call_phone,
        employer_call_result, previous_landlord_name, previous_landlord_phone,
        previous_landlord_result, blacklist_checked, blacklist_result, notes,
        final_status, reviewed_by, reviewed_at, created_at, updated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,NOW(),NOW())
      RETURNING *`,
      [
        params.id,
        params.dto.documents_verified ?? false,
        params.dto.employer_call_name ?? null,
        params.dto.employer_call_phone ?? null,
        params.dto.employer_call_result ?? null,
        params.dto.previous_landlord_name ?? null,
        params.dto.previous_landlord_phone ?? null,
        params.dto.previous_landlord_result ?? null,
        params.dto.blacklist_checked ?? false,
        params.dto.blacklist_result ?? null,
        params.dto.notes ?? null,
        params.dto.final_status ?? null,
        params.dto.final_status ? params.adminId : null,
        now,
      ],
    );

    return created;
  }

  private async handleScreeningApproved(
    id: number,
    dto: UpdateScreeningDto,
    adminId: number,
    checklist: ScreeningChecklistRow,
    tenantSlug: string,
  ): Promise<ApplicationScreeningResult> {
    if (!dto.monthly_rent) {
      throw new BadRequestException(
        'Se requiere monthly_rent para aprobar una solicitud y generar el contrato',
      );
    }

    const result =
      await this.applicationApprovalService.approveAndCreateContract(
        id,
        {
          monthly_rent: dto.monthly_rent,
          currency: dto.currency,
          payment_day: dto.payment_day,
          deposit_amount: dto.deposit_amount,
          admin_feedback:
            dto.admin_feedback ?? `Solicitud aprobada tras screening completo.`,
        },
        adminId,
        tenantSlug,
      );

    return {
      message: 'Solicitud aprobada: contrato generado automáticamente',
      screening: checklist,
      contract: result.contract_generated as Record<string, unknown>,
    };
  }

  private async handleScreeningRejected(
    id: number,
    dto: UpdateScreeningDto,
    application: ApplicationResult,
    checklist: ScreeningChecklistRow,
    tenantSlug: string,
  ): Promise<{ message: string; screening: ScreeningChecklistRow }> {
    await this.applicationStatusService.updateStatus(
      id,
      {
        status: ApplicationStatus.RECHAZADA,
        admin_feedback:
          dto.admin_feedback ??
          'Solicitud rechazada tras el proceso de screening.',
      },
      tenantSlug,
    );

    try {
      const schemaName = await this.getTenantSchemaName(tenantSlug);
      await this.notificationsService.createForUserInSchema(
        schemaName,
        Number(application.applicant_id),
        'application.status.changed' as NotificationEventType,
        'Resultado de tu solicitud de alquiler',
        `Tu solicitud para la propiedad ${String(application.property_title)} ha sido rechazada. ${dto.admin_feedback ?? ''}`.trim(),
        { applicationId: id, final_status: ScreeningFinalStatus.REJECTED },
        tenantSlug,
      );
    } catch (error) {
      this.logger.error('Error al notificar rechazo al inquilino', error);
    }

    return {
      message: 'Solicitud rechazada. Inquilino notificado.',
      screening: checklist,
    };
  }

  private async handleScreeningRequiresCosigner(
    id: number,
    dto: UpdateScreeningDto,
    application: ApplicationResult,
    checklist: ScreeningChecklistRow,
    tenantSlug: string,
  ): Promise<{ message: string; screening: ScreeningChecklistRow }> {
    await this.applicationStatusService.updateStatus(
      id,
      {
        status: ApplicationStatus.EN_REVISION,
        admin_feedback:
          dto.admin_feedback ??
          'Se requiere un co-firmante para continuar con la solicitud.',
      },
      tenantSlug,
    );

    try {
      const schemaName = await this.getTenantSchemaName(tenantSlug);
      await this.notificationsService.createForUserInSchema(
        schemaName,
        Number(application.applicant_id),
        'application.status.changed' as NotificationEventType,
        'Acción requerida en tu solicitud',
        `Tu solicitud para la propiedad ${String(application.property_title)} requiere un co-firmante. Comunícate con la administración.`,
        {
          applicationId: id,
          final_status: ScreeningFinalStatus.REQUIRES_COSIGNER,
        },
        tenantSlug,
      );
    } catch (error) {
      this.logger.error('Error al notificar co-firmante al inquilino', error);
    }

    return {
      message:
        'Solicitud marcada como requiere co-firmante. Inquilino notificado.',
      screening: checklist,
    };
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
