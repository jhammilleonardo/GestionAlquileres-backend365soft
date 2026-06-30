import { Injectable } from '@nestjs/common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import type { ApplicationApprovalResult } from './application-approval.types';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationCreationService } from './application-creation.service';
import {
  ApplicationDocumentsService,
  type ApplicationDocumentRef,
} from './application-documents.service';
import { ApplicationQueriesService } from './application-queries.service';
import { ApplicationScreeningService } from './application-screening.service';
import type { ApplicationScreeningResult } from './application-screening.types';
import { ApplicationScreeningFeeService } from './application-screening-fee.service';
import { ApplicationStatusService } from './application-status.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';

export interface BlacklistAlertInfo {
  is_blacklisted: boolean;
  reason: string | undefined;
  reported_by: string | undefined;
  message: string | undefined;
}

export interface ApplicationResult {
  id: number;
  property_id: number;
  applicant_id: number;
  status: ApplicationStatus;
  personal_data: Record<string, unknown>;
  employment_data: Record<string, unknown>;
  rental_history: Record<string, unknown>;
  references: Record<string, unknown>;
  documents: Record<string, unknown>;
  additional_notes?: string;
  admin_feedback?: string;
  created_at: Date;
  updated_at: Date;
  property_title?: string;
  applicant_name?: string;
  applicant_email?: string;
  blacklist_alert?: BlacklistAlertInfo;
}

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applicationApprovalService: ApplicationApprovalService,
    private readonly applicationCreationService: ApplicationCreationService,
    private readonly applicationDocumentsService: ApplicationDocumentsService,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly applicationScreeningFeeService: ApplicationScreeningFeeService,
    private readonly applicationScreeningService: ApplicationScreeningService,
    private readonly applicationStatusService: ApplicationStatusService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async approveAndCreateContract(
    id: number,
    approveDto: ApproveApplicationDto,
    adminId: number,
    tenantSlug: string,
  ): Promise<ApplicationApprovalResult> {
    const result =
      await this.applicationApprovalService.approveAndCreateContract(
        id,
        approveDto,
        adminId,
        tenantSlug,
      );
    await this.auditLogsService.log({
      userId: adminId,
      action: AuditAction.APPROVED,
      entityType: 'application',
      entityId: id,
      newValues: { status: ApplicationStatus.APROBADA },
    });
    return result;
  }

  async create(
    createApplicationDto: CreateApplicationDto,
    userId: number,
    tenantSlug: string,
  ): Promise<ApplicationResult> {
    return this.applicationCreationService.create(
      createApplicationDto,
      userId,
      tenantSlug,
    );
  }

  async findAll(
    tenantSlug: string,
    status?: ApplicationStatus,
  ): Promise<ApplicationResult[]> {
    return this.applicationQueriesService.findAll(tenantSlug, status);
  }

  async findOne(id: number, tenantSlug: string): Promise<ApplicationResult> {
    return this.applicationQueriesService.findOne(id, tenantSlug);
  }

  async findByApplicant(
    userId: number,
    tenantSlug: string,
  ): Promise<ApplicationResult[]> {
    return this.applicationQueriesService.findByApplicant(userId, tenantSlug);
  }

  async updateStatus(
    id: number,
    updateDto: UpdateApplicationStatusDto,
    tenantSlug: string,
  ): Promise<ApplicationResult> {
    const result = await this.applicationStatusService.updateStatus(
      id,
      updateDto,
      tenantSlug,
    );
    const action =
      updateDto.status === ApplicationStatus.RECHAZADA
        ? AuditAction.REJECTED
        : AuditAction.STATUS_CHANGED;
    await this.auditLogsService.log({
      action,
      entityType: 'application',
      entityId: id,
      newValues: { status: updateDto.status },
    });
    return result;
  }

  async uploadDocuments(
    id: number,
    files: Express.Multer.File[],
    types: string[],
    tenantSlug: string,
  ): Promise<{ message: string; documents: ApplicationDocumentRef[] }> {
    return this.applicationDocumentsService.uploadDocuments(
      id,
      files,
      types,
      tenantSlug,
    );
  }

  async completeScreening(
    id: number,
    dto: UpdateScreeningDto,
    adminId: number,
    tenantSlug: string,
  ): Promise<ApplicationScreeningResult> {
    return this.applicationScreeningService.completeScreening(
      id,
      dto,
      adminId,
      tenantSlug,
    );
  }

  async markScreeningFeePaid(
    id: number,
    tenantSlug: string,
  ): Promise<{ message: string }> {
    return this.applicationScreeningFeeService.markPaid(id, tenantSlug);
  }
}
