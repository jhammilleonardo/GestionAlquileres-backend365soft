import { BadRequestException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { ContractsService } from '../contracts/contracts.service';
import { CreateContractDto } from '../contracts/dto/create-contract.dto';
import { TenantsService } from '../tenants/tenants.service';
import type { ApplicationResult } from './applications.service';
import { ApplicationApprovalContractFactoryService } from './application-approval-contract-factory.service';
import { ApplicationApprovalSideEffectsService } from './application-approval-side-effects.service';
import {
  ApplicationApprovalResult,
  GeneratedContractSummary,
} from './application-approval.types';
import { ApproveApplicationDto } from './dto/approve-application.dto';
import { ApplicationStatus } from './enums/application-status.enum';

@Injectable()
export class ApplicationApprovalService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly contractsService: ContractsService,
    private readonly tenantsService: TenantsService,
    private readonly applicationApprovalContractFactoryService: ApplicationApprovalContractFactoryService,
    private readonly applicationApprovalSideEffectsService: ApplicationApprovalSideEffectsService,
  ) {}

  async approveAndCreateContract(
    id: number,
    approveDto: ApproveApplicationDto,
    adminId: number,
    tenantSlug: string,
  ): Promise<ApplicationApprovalResult> {
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

      contractData =
        this.applicationApprovalContractFactoryService.buildContractData(
          id,
          application,
          approveDto,
        );
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

    await this.applicationApprovalSideEffectsService.emitPostApprovalSideEffects(
      {
        adminId,
        application,
        contract,
        contractData,
        schemaName,
        schemaPrefix,
        tenantSlug,
        updateDto: approveDto,
      },
    );

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

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
