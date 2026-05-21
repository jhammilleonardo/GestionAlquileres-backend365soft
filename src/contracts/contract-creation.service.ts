import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { Contract } from './entities/contract.entity';
import { ContractStatus } from './enums/contract-status.enum';
import { ContractHistoryService } from './contract-history.service';
import { ContractNumberService } from './contract-number.service';
import {
  ContractCreatedSideEffectsParams,
  ContractCreationSideEffectsService,
} from './contract-creation-side-effects.service';
import { ContractCreationValidationService } from './contract-creation-validation.service';

export interface CreateContractOptions {
  queryRunner?: QueryRunner;
  skipSideEffects?: boolean;
}

export type { ContractCreatedSideEffectsParams };

@Injectable()
export class ContractCreationService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly contractNumberService: ContractNumberService,
    private readonly contractHistoryService: ContractHistoryService,
    private readonly contractCreationSideEffectsService: ContractCreationSideEffectsService,
    private readonly contractCreationValidationService: ContractCreationValidationService,
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

    await this.contractCreationValidationService.validate({
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
    await this.contractCreationSideEffectsService.emitCreated(params);
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

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
