import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { ContractsService } from '../contracts/contracts.service';
import { CreateContractDto } from '../contracts/dto/create-contract.dto';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { ApplicationStatus } from './enums/application-status.enum';

interface GeneratedContractSummary {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  status: string;
  monthly_rent: number;
  currency: string;
  deposit_amount: number;
}

@Injectable()
export class ApplicationApprovalService {
  private readonly logger = new Logger(ApplicationApprovalService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly contractsService: ContractsService,
    private readonly notificationsService: NotificationsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async approveAndCreateContract(
    id: number,
    approveDto: ApproveApplicationDto,
    adminId: number,
    tenantSlug: string,
  ) {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let application: ApplicationResult;
    let updatedApplication: ApplicationResult;
    let contract: GeneratedContractSummary;
    let contractData: CreateContractDto;

    try {
      application = await this.lockApplicationForApproval(
        queryRunner,
        schemaPrefix,
        id,
      );

      if (application.status === ApplicationStatus.APROBADA) {
        throw new BadRequestException('Esta solicitud ya ha sido aprobada');
      }

      contractData = this.buildContractData(id, application, approveDto);
      updatedApplication = await this.markApplicationApproved(
        queryRunner,
        schemaPrefix,
        id,
        approveDto.admin_feedback ||
          `Solicitud aprobada para la propiedad "${String(application.property_title)}".`,
      );

      contract = (await this.contractsService.create(
        contractData,
        adminId,
        tenantSlug,
        {
          queryRunner,
          skipSideEffects: true,
        },
      )) as GeneratedContractSummary;

      await queryRunner.commitTransaction();
    } catch (error: unknown) {
      await queryRunner.rollbackTransaction();
      if (error instanceof BadRequestException) {
        throw error;
      }

      const reason =
        error instanceof Error ? error.message : 'Error al crear el contrato';
      throw new BadRequestException(
        `No se pudo aprobar la solicitud: ${reason}`,
      );
    } finally {
      await queryRunner.release();
    }

    await this.emitPostApprovalSideEffects({
      adminId,
      application,
      contract,
      contractData,
      schemaName,
      schemaPrefix,
      tenantSlug,
      updateDto: approveDto,
    });

    return {
      message: 'Solicitud aprobada y contrato creado con éxito',
      application: {
        id: updatedApplication.id,
        status: updatedApplication.status,
        property: application.property_title,
        applicant: application.applicant_name,
      },
      contract_generated: {
        id: contract.id,
        number: contract.contract_number,
        status: contract.status,
        monthly_rent: contract.monthly_rent,
        currency: contract.currency,
        deposit_amount: contract.deposit_amount,
        message:
          'Se ha creado un borrador de contrato automáticamente. El inquilino podrá firmarlo desde su portal.',
      },
    };
  }

  private async lockApplicationForApproval(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    id: number,
  ): Promise<ApplicationResult> {
    const rows = (await queryRunner.query(
      `SELECT ra.*, p.title as property_title, u.name as applicant_name, u.email as applicant_email
       FROM ${schemaPrefix}rental_applications ra
       JOIN ${schemaPrefix}properties p ON ra.property_id = p.id
       JOIN ${schemaPrefix}"user" u ON ra.applicant_id = u.id
       WHERE ra.id = $1
       FOR UPDATE OF ra`,
      [id],
    )) as ApplicationResult[];

    const application = rows[0];
    if (!application) {
      throw new BadRequestException('Solicitud no encontrada');
    }

    return application;
  }

  private async markApplicationApproved(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    id: number,
    adminFeedback: string,
  ): Promise<ApplicationResult> {
    const rows = (await queryRunner.query(
      `UPDATE ${schemaPrefix}rental_applications
       SET status = $1, admin_feedback = $2, updated_at = NOW()
       WHERE id = $3
       RETURNING *`,
      [ApplicationStatus.APROBADA, adminFeedback, id],
    )) as ApplicationResult[];

    return rows[0];
  }

  private async emitPostApprovalSideEffects(params: {
    adminId: number;
    application: ApplicationResult;
    contract: GeneratedContractSummary;
    contractData: CreateContractDto;
    schemaName: string;
    schemaPrefix: string;
    tenantSlug: string;
    updateDto: ApproveApplicationDto;
  }): Promise<void> {
    await this.contractsService.emitContractCreatedSideEffects({
      adminUserId: params.adminId,
      contract: params.contract,
      contractNumber: params.contract.contract_number,
      createContractDto: params.contractData,
      schemaName: params.schemaName,
      schemaPrefix: params.schemaPrefix,
      tenantSlug: params.tenantSlug,
    });

    try {
      await this.notificationsService.createForUserInSchema(
        params.schemaName,
        Number(params.application.applicant_id),
        'application.status.changed' as NotificationEventType,
        'Actualización de tu solicitud',
        `Tu solicitud para la propiedad ${String(params.application.property_title)} ha cambiado a: ${String(ApplicationStatus.APROBADA)}`,
        {
          applicationId: params.application.id,
          status: ApplicationStatus.APROBADA,
          feedback: params.updateDto.admin_feedback,
        },
        params.tenantSlug,
      );
    } catch (error) {
      this.logger.error('Error al notificar aprobación al inquilino', error);
    }
  }

  private buildContractData(
    applicationId: number,
    application: ApplicationResult,
    approveDto: ApproveApplicationDto,
  ): CreateContractDto {
    const startDate = approveDto.start_date
      ? new Date(approveDto.start_date)
      : new Date();
    const endDate = approveDto.end_date
      ? new Date(approveDto.end_date)
      : new Date(
          Date.UTC(
            startDate.getFullYear() + 1,
            startDate.getMonth(),
            startDate.getDate(),
          ),
        );
    const depositAmount = approveDto.deposit_amount ?? approveDto.monthly_rent;

    const contractData: CreateContractDto = {
      property_id: Number(application.property_id),
      tenant_id: Number(application.applicant_id),
      start_date: startDate.toISOString(),
      end_date: endDate.toISOString(),
      monthly_rent: approveDto.monthly_rent,
      currency: approveDto.currency || 'BOB',
      payment_day: approveDto.payment_day || 5,
      deposit_amount: depositAmount,
      application_id: applicationId,
    };

    if (approveDto.payment_method) {
      contractData.payment_method = approveDto.payment_method;
    }
    if (approveDto.late_fee_percentage !== undefined) {
      contractData.late_fee_percentage = approveDto.late_fee_percentage;
    }
    if (approveDto.grace_days !== undefined) {
      contractData.grace_days = approveDto.grace_days;
    }
    if (approveDto.included_services) {
      contractData.included_services = approveDto.included_services;
    }
    if (approveDto.key_delivery_date) {
      contractData.key_delivery_date = approveDto.key_delivery_date;
    }
    if (approveDto.tenant_responsibilities) {
      contractData.tenant_responsibilities = approveDto.tenant_responsibilities;
    }
    if (approveDto.owner_responsibilities) {
      contractData.owner_responsibilities = approveDto.owner_responsibilities;
    }
    if (approveDto.prohibitions) {
      contractData.prohibitions = approveDto.prohibitions;
    }
    if (approveDto.coexistence_rules) {
      contractData.coexistence_rules = approveDto.coexistence_rules;
    }
    if (approveDto.renewal_terms) {
      contractData.renewal_terms = approveDto.renewal_terms;
    }
    if (approveDto.termination_terms) {
      contractData.termination_terms = approveDto.termination_terms;
    }
    if (approveDto.jurisdiction) {
      contractData.jurisdiction = approveDto.jurisdiction;
    }
    if (approveDto.auto_renew !== undefined) {
      contractData.auto_renew = approveDto.auto_renew;
    }
    if (approveDto.renewal_notice_days !== undefined) {
      contractData.renewal_notice_days = approveDto.renewal_notice_days;
    }
    if (approveDto.auto_increase_percentage !== undefined) {
      contractData.auto_increase_percentage =
        approveDto.auto_increase_percentage;
    }
    if (approveDto.bank_account_number) {
      contractData.bank_account_number = approveDto.bank_account_number;
    }
    if (approveDto.bank_account_type) {
      contractData.bank_account_type = approveDto.bank_account_type;
    }
    if (approveDto.bank_name) {
      contractData.bank_name = approveDto.bank_name;
    }
    if (approveDto.bank_account_holder) {
      contractData.bank_account_holder = approveDto.bank_account_holder;
    }

    return contractData;
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
