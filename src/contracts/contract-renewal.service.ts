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
import { TenantsService } from '../tenants/tenants.service';
import type { ContractResult } from './contracts.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractNumberService } from './contract-number.service';
import { RenewContractDto } from './dto/renew-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

@Injectable()
export class ContractRenewalService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly contractNumberService: ContractNumberService,
    private readonly contractHistoryService: ContractHistoryService,
    private readonly auditLogsService: AuditLogsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async renew(
    id: number,
    dto: RenewContractDto = {},
    userId: number = 0,
    tenantSlug?: string,
  ): Promise<ContractResult> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const oldContract = await this.lockContractForRenewal(
        queryRunner,
        schemaPrefix,
        id,
      );

      if (
        oldContract.status !== ContractStatus.ACTIVO &&
        oldContract.status !== ContractStatus.POR_VENCER
      ) {
        throw new BadRequestException(
          'Solo se pueden renovar contratos activos o por vencer',
        );
      }

      const durationMonths =
        dto.duration_months ?? oldContract.duration_months ?? 12;
      const newStartDate = this.resolveStartDate(dto, oldContract);
      const newEndDate = this.resolveEndDate(newStartDate, durationMonths);
      const newRent = this.resolveRent(dto, oldContract);
      const newContractNumber = await this.contractNumberService.generate(
        tenantSlug,
        queryRunner,
      );
      const includedServices =
        dto.included_services ?? oldContract.included_services;

      const insertResult = (await queryRunner.query(
        `INSERT INTO ${schemaPrefix}contracts
         (tenant_id, property_id, unit_id, contract_number, start_date, end_date, duration_months,
          monthly_rent, currency, payment_day, deposit_amount, payment_method,
          late_fee_percentage, grace_days, included_services, tenant_responsibilities,
          owner_responsibilities, prohibitions, coexistence_rules, renewal_terms, termination_terms,
          jurisdiction, auto_renew, renewal_notice_days, auto_increase_percentage,
          previous_contract_id, bank_account_number, bank_account_type, bank_name, bank_account_holder,
          status, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, NOW(), NOW())
         RETURNING *`,
        [
          oldContract.tenant_id,
          oldContract.property_id,
          oldContract.unit_id ?? null,
          newContractNumber,
          this.toDateOnly(newStartDate),
          this.toDateOnly(newEndDate),
          durationMonths,
          newRent,
          dto.currency ?? oldContract.currency,
          dto.payment_day ?? oldContract.payment_day,
          dto.deposit_amount ?? oldContract.deposit_amount,
          dto.payment_method ?? oldContract.payment_method ?? null,
          dto.late_fee_percentage ?? oldContract.late_fee_percentage ?? 0,
          dto.grace_days ?? oldContract.grace_days ?? 0,
          includedServices ? JSON.stringify(includedServices) : null,
          dto.tenant_responsibilities ??
            oldContract.tenant_responsibilities ??
            null,
          dto.owner_responsibilities ??
            oldContract.owner_responsibilities ??
            null,
          dto.prohibitions ?? oldContract.prohibitions ?? null,
          dto.coexistence_rules ?? oldContract.coexistence_rules ?? null,
          dto.renewal_terms ?? oldContract.renewal_terms ?? null,
          dto.termination_terms ?? oldContract.termination_terms ?? null,
          dto.jurisdiction ?? oldContract.jurisdiction ?? 'Bolivia',
          dto.auto_renew ?? oldContract.auto_renew ?? false,
          dto.renewal_notice_days ?? oldContract.renewal_notice_days ?? 30,
          dto.auto_increase_percentage ??
            oldContract.auto_increase_percentage ??
            0,
          oldContract.id,
          oldContract.bank_account_number ?? null,
          oldContract.bank_account_type ?? null,
          oldContract.bank_name ?? null,
          oldContract.bank_account_holder ?? null,
          ContractStatus.BORRADOR,
        ],
      )) as unknown as ContractResult[];

      const savedContract = insertResult[0];

      await queryRunner.query(
        `UPDATE ${schemaPrefix}contracts SET status = $1, updated_at = NOW() WHERE id = $2`,
        [ContractStatus.RENOVADO, id],
      );

      await this.contractHistoryService.logChange({
        contractId: id,
        field: 'status',
        oldValue: oldContract.status,
        newValue: ContractStatus.RENOVADO,
        userId,
        reason: 'Contrato renovado',
        schemaName,
        queryRunner,
      });
      await this.contractHistoryService.logChange({
        contractId: savedContract.id,
        field: 'status',
        oldValue: null,
        newValue: ContractStatus.BORRADOR,
        userId,
        reason: 'Creado por renovación',
        schemaName,
        queryRunner,
      });

      await queryRunner.commitTransaction();

      await this.auditLogsService.log({
        userId,
        action: AuditAction.RENEWED,
        entityType: 'contract',
        entityId: id,
        oldValues: { status: oldContract.status },
        newValues: {
          newContractId: savedContract.id,
          newContractNumber,
          status: ContractStatus.RENOVADO,
        },
      });

      return savedContract;
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async lockContractForRenewal(
    queryRunner: QueryRunner,
    schemaPrefix: string,
    id: number,
  ): Promise<ContractResult> {
    const rows = (await queryRunner.query(
      `SELECT * FROM ${schemaPrefix}contracts WHERE id = $1 FOR UPDATE`,
      [id],
    )) as unknown as ContractResult[];

    const contract = rows[0];
    if (!contract) {
      throw new NotFoundException(`Contrato con ID ${id} no encontrado`);
    }

    return contract;
  }

  private resolveStartDate(
    dto: RenewContractDto,
    oldContract: ContractResult,
  ): Date {
    if (dto.start_date) {
      return new Date(dto.start_date);
    }

    const date = new Date(oldContract.end_date as string);
    date.setDate(date.getDate() + 1);
    return date;
  }

  private resolveEndDate(startDate: Date, durationMonths: number): Date {
    const endDate = new Date(startDate);
    endDate.setMonth(endDate.getMonth() + durationMonths);
    return endDate;
  }

  private resolveRent(
    dto: RenewContractDto,
    oldContract: ContractResult,
  ): number {
    return (
      dto.monthly_rent ??
      oldContract.monthly_rent *
        (1 + (oldContract.auto_increase_percentage ?? 0) / 100)
    );
  }

  private toDateOnly(date: Date): string {
    return date.toISOString().split('T')[0];
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
