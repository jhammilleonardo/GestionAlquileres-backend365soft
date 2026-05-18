import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { Contract } from './entities/contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { ContractHistoryService } from './contract-history.service';
import { ContractNumberService } from './contract-number.service';

export interface CreateContractOptions {
  queryRunner?: QueryRunner;
  skipSideEffects?: boolean;
}

export interface ContractCreatedSideEffectsParams {
  adminUserId?: number;
  contract: { id: number; tenant_id: number; property_id: number };
  contractNumber: string;
  createContractDto: CreateContractDto;
  schemaName?: string | null;
  schemaPrefix: string;
  tenantSlug?: string;
}

type SqlExecutor = Pick<DataSource, 'query'> | QueryRunner;

@Injectable()
export class ContractCreationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly tenantsService: TenantsService,
    private readonly contractNumberService: ContractNumberService,
    private readonly contractHistoryService: ContractHistoryService,
  ) {}

  async create(
    createContractDto: CreateContractDto,
    adminUserId?: number,
    tenantSlug?: string,
    options: CreateContractOptions = {},
  ): Promise<Contract> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const executor = options.queryRunner ?? this.dataSource;

    await this.validateContractCreation({
      createContractDto,
      adminUserId,
      executor,
      schemaPrefix,
    });

    const durationMonths = this.calculateDurationMonths(
      createContractDto.start_date,
      createContractDto.end_date,
    );

    const queryRunner =
      options.queryRunner ?? this.dataSource.createQueryRunner();
    const ownsQueryRunner = !options.queryRunner;
    if (ownsQueryRunner) {
      await queryRunner.connect();
      await queryRunner.startTransaction();
    }

    let contractNumber!: string;
    let savedContract!: Contract;

    try {
      contractNumber = await this.contractNumberService.generate(
        tenantSlug,
        queryRunner,
      );

      savedContract = await this.insertContract({
        createContractDto,
        contractNumber,
        durationMonths,
        queryRunner,
        schemaPrefix,
      });

      await queryRunner.query(
        `UPDATE ${schemaPrefix}properties SET status = 'OCUPADO', updated_at = NOW() WHERE id = $1`,
        [createContractDto.property_id],
      );

      await this.contractHistoryService.logChange({
        contractId: savedContract.id,
        field: 'status',
        oldValue: null,
        newValue: ContractStatus.BORRADOR,
        userId: 0,
        reason: 'Creación de contrato',
        schemaName,
        queryRunner,
      });

      if (ownsQueryRunner) {
        await queryRunner.commitTransaction();
      }
    } catch (error) {
      if (ownsQueryRunner) {
        await queryRunner.rollbackTransaction();
      }
      throw error;
    } finally {
      if (ownsQueryRunner) {
        await queryRunner.release();
      }
    }

    if (!options.skipSideEffects) {
      await this.emitCreatedSideEffects({
        adminUserId,
        contract: savedContract,
        contractNumber,
        createContractDto,
        schemaName,
        schemaPrefix,
        tenantSlug,
      });
    }

    return savedContract;
  }

  async emitCreatedSideEffects(
    params: ContractCreatedSideEffectsParams,
  ): Promise<void> {
    await this.auditLogsService.log({
      userId: params.adminUserId ?? 0,
      action: AuditAction.CREATED,
      entityType: 'contract',
      entityId: params.contract.id,
      newValues: {
        contract_number: params.contractNumber,
        tenant_id: params.contract.tenant_id,
        property_id: params.contract.property_id,
        status: ContractStatus.BORRADOR,
      },
    });

    try {
      const tenantId: number = params.createContractDto.tenant_id;
      if (params.schemaName) {
        await this.notificationsService.createForUserInSchema(
          params.schemaName,
          tenantId,
          NotificationEventType.CONTRACT_CREATED,
          'Nuevo contrato disponible',
          `Se ha creado el contrato ${params.contractNumber}. Por favor revísalo y fírmalo.`,
          {
            contract_id: params.contract.id,
            contract_number: params.contractNumber,
          },
          params.tenantSlug,
        );
      } else {
        await this.notificationsService.createForUser(
          tenantId,
          NotificationEventType.CONTRACT_CREATED,
          'Nuevo contrato disponible',
          `Se ha creado el contrato ${params.contractNumber}. Por favor revísalo y fírmalo.`,
          {
            contract_id: params.contract.id,
            contract_number: params.contractNumber,
          },
          params.tenantSlug,
        );
      }

      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM ${params.schemaPrefix}"user" WHERE role = 'ADMIN' LIMIT 5`,
      );
      const adminIds = admins.map((admin) => admin.id);
      if (adminIds.length > 0) {
        await Promise.all(
          adminIds.map((adminId) =>
            params.schemaName
              ? this.notificationsService.createForUserInSchema(
                  params.schemaName,
                  adminId,
                  NotificationEventType.CONTRACT_CREATED,
                  'Nuevo contrato creado',
                  `Se ha creado el contrato ${params.contractNumber} para el inquilino ID ${tenantId}`,
                  {
                    contract_id: params.contract.id,
                    contract_number: params.contractNumber,
                  },
                  params.tenantSlug,
                )
              : this.notificationsService.createForUser(
                  adminId,
                  NotificationEventType.CONTRACT_CREATED,
                  'Nuevo contrato creado',
                  `Se ha creado el contrato ${params.contractNumber} para el inquilino ID ${tenantId}`,
                  {
                    contract_id: params.contract.id,
                    contract_number: params.contractNumber,
                  },
                  params.tenantSlug,
                ),
          ),
        );
      }
    } catch {
      // No propagar errores de notificación.
    }
  }

  private async validateContractCreation(params: {
    createContractDto: CreateContractDto;
    adminUserId?: number;
    executor: SqlExecutor;
    schemaPrefix: string;
  }): Promise<void> {
    const { createContractDto, adminUserId, executor, schemaPrefix } = params;

    if (
      !createContractDto.application_id &&
      adminUserId &&
      createContractDto.tenant_id === adminUserId
    ) {
      throw new BadRequestException(
        'No puedes crear un contrato para ti mismo. Los administradores no pueden ser inquilinos.',
      );
    }

    if (!createContractDto.application_id) {
      const tenant = await this.queryRows<{ role: string }>(
        executor,
        `SELECT role FROM ${schemaPrefix}"user" WHERE id = $1`,
        [createContractDto.tenant_id],
      );

      if (tenant.length === 0) {
        throw new NotFoundException(
          `Usuario con ID ${createContractDto.tenant_id} no encontrado`,
        );
      }

      if (tenant[0].role !== 'INQUILINO') {
        throw new BadRequestException(
          'El contrato solo puede ser asignado a usuarios con rol INQUILINO',
        );
      }

      const approvedApplication = await this.queryRows<{ id: number }>(
        executor,
        `SELECT id FROM ${schemaPrefix}rental_applications
         WHERE applicant_id = $1 AND status = 'APROBADA'
         ORDER BY created_at DESC
         LIMIT 1`,
        [createContractDto.tenant_id],
      );

      if (approvedApplication.length === 0) {
        throw new BadRequestException(
          'No se puede crear un contrato manual para este inquilino. ' +
            'El inquilino debe tener al menos una solicitud de alquiler aprobada antes de poder crear un contrato. ' +
            'Utilice el flujo de solicitudes para aprobar al inquilino primero.',
        );
      }
    } else {
      const application = await this.queryRows<{
        id: number;
        applicant_id: number;
      }>(
        executor,
        `SELECT id, applicant_id FROM ${schemaPrefix}rental_applications WHERE id = $1`,
        [createContractDto.application_id],
      );

      if (application.length === 0) {
        throw new NotFoundException(
          `La solicitud con ID ${createContractDto.application_id} no existe`,
        );
      }

      if (application[0].applicant_id !== createContractDto.tenant_id) {
        throw new BadRequestException(
          'La solicitud no pertenece al inquilino especificado',
        );
      }
    }

    const activeContract = await this.queryRows<{ id: number }>(
      executor,
      `SELECT id FROM ${schemaPrefix}contracts WHERE tenant_id = $1 AND status = $2`,
      [createContractDto.tenant_id, ContractStatus.ACTIVO],
    );

    if (activeContract.length > 0) {
      throw new BadRequestException(
        `El inquilino ya tiene un contrato activo (ID: ${activeContract[0].id}). No se puede crear otro contrato mientras exista uno activo.`,
      );
    }

    const property = await this.queryRows<{ status: string }>(
      executor,
      `SELECT status FROM ${schemaPrefix}properties WHERE id = $1`,
      [createContractDto.property_id],
    );

    if (property.length === 0) {
      throw new NotFoundException(
        `Propiedad con ID ${createContractDto.property_id} no encontrada`,
      );
    }

    if (
      !createContractDto.application_id &&
      !['DISPONIBLE', 'RESERVADO'].includes(property[0].status)
    ) {
      throw new BadRequestException(
        `La propiedad no está disponible para un nuevo contrato (estado actual: ${property[0].status})`,
      );
    }
  }

  private async insertContract(params: {
    createContractDto: CreateContractDto;
    contractNumber: string;
    durationMonths: number;
    queryRunner: QueryRunner;
    schemaPrefix: string;
  }): Promise<Contract> {
    const { createContractDto, contractNumber, durationMonths, queryRunner } =
      params;

    const insertResult = (await queryRunner.query(
      `INSERT INTO ${params.schemaPrefix}contracts
       (contract_number, tenant_id, property_id, status, start_date, end_date, duration_months,
        key_delivery_date, monthly_rent, currency, payment_day, deposit_amount, payment_method,
        late_fee_percentage, grace_days, included_services, tenant_responsibilities,
        owner_responsibilities, prohibitions, coexistence_rules, renewal_terms, termination_terms,
        jurisdiction, auto_renew, renewal_notice_days, auto_increase_percentage,
        bank_account_number, bank_account_type, bank_name, bank_account_holder, application_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())
       RETURNING *`,
      [
        contractNumber,
        createContractDto.tenant_id,
        createContractDto.property_id,
        ContractStatus.BORRADOR,
        createContractDto.start_date,
        createContractDto.end_date,
        durationMonths,
        createContractDto.key_delivery_date || null,
        createContractDto.monthly_rent,
        createContractDto.currency || 'BOB',
        createContractDto.payment_day || 5,
        createContractDto.deposit_amount || 0,
        createContractDto.payment_method || null,
        createContractDto.late_fee_percentage || 0,
        createContractDto.grace_days || 0,
        createContractDto.included_services
          ? JSON.stringify(createContractDto.included_services)
          : null,
        createContractDto.tenant_responsibilities || null,
        createContractDto.owner_responsibilities || null,
        createContractDto.prohibitions || null,
        createContractDto.coexistence_rules || null,
        createContractDto.renewal_terms || null,
        createContractDto.termination_terms || null,
        createContractDto.jurisdiction || 'Bolivia',
        createContractDto.auto_renew || false,
        createContractDto.renewal_notice_days || 30,
        createContractDto.auto_increase_percentage || 0,
        createContractDto.bank_account_number || null,
        createContractDto.bank_account_type || null,
        createContractDto.bank_name || null,
        createContractDto.bank_account_holder || null,
        createContractDto.application_id || null,
      ],
    )) as unknown as Contract[];

    return insertResult[0];
  }

  private calculateDurationMonths(
    startDateValue: string,
    endDateValue: string,
  ) {
    const startDate = new Date(startDateValue);
    const endDate = new Date(endDateValue);
    const diffTime = Math.abs(endDate.getTime() - startDate.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24 * 30.44));
  }

  private async queryRows<T>(
    executor: SqlExecutor,
    sql: string,
    params: unknown[] = [],
  ): Promise<T[]> {
    return (await executor.query(sql, params)) as unknown as T[];
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
