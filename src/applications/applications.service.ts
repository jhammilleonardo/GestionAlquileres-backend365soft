import { Injectable } from '@nestjs/common';
import { CreateApplicationDto } from './dto/create-application.dto';
import { UpdateApplicationStatusDto } from './dto/update-application-status.dto';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { UpdateScreeningDto } from './dto/update-screening.dto';
import { ApplicationStatus } from './enums/application-status.enum';
import { ApplicationApprovalService } from './application-approval.service';
import { ApplicationCreationService } from './application-creation.service';
import {
  ApplicationDocumentsService,
  type ApplicationDocumentRef,
} from './application-documents.service';
import { ApplicationQueriesService } from './application-queries.service';
import {
  ApplicationScreeningService,
  type ApplicationScreeningResult,
} from './application-screening.service';
import { ApplicationScreeningFeeService } from './application-screening-fee.service';
import { ApplicationStatusService } from './application-status.service';

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
  ) {}

  async approveAndCreateContract(
    id: number,
    approveDto: ApproveApplicationDto,
    adminId: number,
    tenantSlug: string,
  ) {
    return this.applicationApprovalService.approveAndCreateContract(
      id,
      approveDto,
      adminId,
      tenantSlug,
    );
  }

  async create(
    createApplicationDto: CreateApplicationDto,
    userId: number,
    tenantSlug: string,
  ) {
    return this.applicationCreationService.create(
      createApplicationDto,
      userId,
      tenantSlug,
    );
  }

  async findAll(tenantSlug: string, status?: ApplicationStatus) {
    return this.applicationQueriesService.findAll(tenantSlug, status);
  }

  async findOne(id: number, tenantSlug: string) {
    return this.applicationQueriesService.findOne(id, tenantSlug);
  }

  async findByApplicant(userId: number, tenantSlug: string) {
    return this.applicationQueriesService.findByApplicant(userId, tenantSlug);
  }

  async updateStatus(
    id: number,
    updateDto: UpdateApplicationStatusDto,
    tenantSlug: string,
  ) {
    return this.applicationStatusService.updateStatus(
      id,
      updateDto,
      tenantSlug,
    );
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
