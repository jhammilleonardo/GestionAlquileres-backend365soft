import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationScreeningDecisionService } from './application-screening-decision.service';
import {
  ApplicationScreeningResult,
  ScreeningChecklistRow,
} from './application-screening.types';
import { UpdateScreeningDto } from './dto/update-screening.dto';

@Injectable()
export class ApplicationScreeningService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly applicationScreeningDecisionService: ApplicationScreeningDecisionService,
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

    return this.applicationScreeningDecisionService.handleFinalStatus(dto, {
      id,
      application,
      checklist,
      adminId,
      tenantSlug,
      schemaName,
    });
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

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
