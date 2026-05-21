import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { quoteIdent } from '../common/utils/sql-identifier';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import type { ContractResult } from './contracts.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractQueriesService } from './contract-queries.service';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

@Injectable()
export class ContractUpdateService {
  private readonly logger = new Logger(ContractUpdateService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly lifecycleNotificationsService: LifecycleNotificationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly tenantsService: TenantsService,
    private readonly contractHistoryService: ContractHistoryService,
    private readonly contractQueriesService: ContractQueriesService,
  ) {}

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    userId: number = 0,
    tenantSlug?: string,
  ): Promise<ContractResult> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const updateStatement = this.buildUpdateStatement(updateContractDto);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let contract: ContractResult;
    let statusChanged = false;

    try {
      contract = await this.lockContractForUpdate(
        queryRunner,
        schemaPrefix,
        id,
      );
      statusChanged =
        updateContractDto.status !== undefined &&
        updateContractDto.status !== contract.status;

      if (updateStatement.updates.length > 0) {
        updateStatement.values.push(id);
        await queryRunner.query(
          `UPDATE ${schemaPrefix}contracts SET ${updateStatement.updates.join(', ')} WHERE id = $${updateStatement.values.length}`,
          updateStatement.values,
        );
      }

      if (statusChanged && updateContractDto.status) {
        await this.logStatusChange({
          contract,
          id,
          newStatus: updateContractDto.status,
          queryRunner,
          schemaName,
          schemaPrefix,
          updateReason: updateContractDto.update_reason,
          userId,
        });
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    const updatedContract = await this.contractQueriesService.findOne(
      id,
      tenantSlug,
    );

    if (statusChanged && updateContractDto.status) {
      await this.emitStatusChangedSideEffects({
        contract,
        id,
        newStatus: updateContractDto.status,
        schemaName,
        tenantSlug,
        updateReason: updateContractDto.update_reason,
        userId,
      });
    }

    return updatedContract;
  }

  private buildUpdateStatement(updateContractDto: UpdateContractDto): {
    updates: string[];
    values: (string | number | boolean | null)[];
  } {
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];

    const fieldMapping: Record<string, string> = {
      monthly_rent: 'monthly_rent',
      currency: 'currency',
      payment_day: 'payment_day',
      deposit_amount: 'deposit_amount',
      payment_method: 'payment_method',
      late_fee_percentage: 'late_fee_percentage',
      grace_days: 'grace_days',
      tenant_responsibilities: 'tenant_responsibilities',
      owner_responsibilities: 'owner_responsibilities',
      prohibitions: 'prohibitions',
      coexistence_rules: 'coexistence_rules',
      renewal_terms: 'renewal_terms',
      termination_terms: 'termination_terms',
      jurisdiction: 'jurisdiction',
      auto_renew: 'auto_renew',
      renewal_notice_days: 'renewal_notice_days',
      auto_increase_percentage: 'auto_increase_percentage',
      bank_account_number: 'bank_account_number',
      bank_account_type: 'bank_account_type',
      bank_name: 'bank_name',
      bank_account_holder: 'bank_account_holder',
      status: 'status',
      included_services: 'included_services',
    };

    for (const key of Object.keys(updateContractDto)) {
      const val = updateContractDto[key as keyof UpdateContractDto];
      if (val === undefined || !fieldMapping[key]) {
        continue;
      }

      const field = fieldMapping[key];
      updates.push(`${field} = $${values.length + 1}`);

      if (key === 'included_services') {
        values.push(JSON.stringify(val));
      } else if (key === 'auto_renew') {
        values.push(Boolean(val));
      } else {
        values.push(val as string | number | boolean | null);
      }
    }

    if (updates.length > 0) {
      updates.push(`updated_at = NOW()`);
    }

    return { updates, values };
  }

  private async lockContractForUpdate(
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

  private async logStatusChange(params: {
    contract: ContractResult;
    id: number;
    newStatus: ContractStatus;
    queryRunner: QueryRunner;
    schemaName?: string | null;
    schemaPrefix: string;
    updateReason?: string;
    userId: number;
  }): Promise<void> {
    await this.contractHistoryService.logChange({
      contractId: params.id,
      field: 'status',
      oldValue: params.contract.status,
      newValue: params.newStatus,
      userId: params.userId,
      reason: params.updateReason || 'Cambio de estado',
      schemaName: params.schemaName,
      queryRunner: params.queryRunner,
    });

    if (params.newStatus === ContractStatus.ACTIVO) {
      await params.queryRunner.query(
        `UPDATE ${params.schemaPrefix}properties SET status = 'OCUPADO' WHERE id = $1`,
        [params.contract.property_id],
      );
    }

    if (
      [
        ContractStatus.FINALIZADO,
        ContractStatus.VENCIDO,
        ContractStatus.CANCELADO,
      ].includes(params.newStatus)
    ) {
      await params.queryRunner.query(
        `UPDATE ${params.schemaPrefix}properties SET status = 'DISPONIBLE' WHERE id = $1`,
        [params.contract.property_id],
      );
    }
  }

  private async emitStatusChangedSideEffects(params: {
    contract: ContractResult;
    id: number;
    newStatus: ContractStatus;
    schemaName?: string | null;
    tenantSlug?: string;
    updateReason?: string;
    userId: number;
  }): Promise<void> {
    try {
      await this.notifyStatusChanged(params);
    } catch (error) {
      this.logger.warn(
        `No se pudo emitir notificacion de cambio de contrato ${params.id}: ${String(error)}`,
      );
    }

    await this.auditLogsService.log({
      userId: params.userId,
      action: AuditAction.STATUS_CHANGED,
      entityType: 'contract',
      entityId: params.id,
      oldValues: { status: params.contract.status },
      newValues: {
        status: params.newStatus,
        reason: params.updateReason,
      },
    });
  }

  private async notifyStatusChanged(params: {
    contract: ContractResult;
    id: number;
    newStatus: ContractStatus;
    schemaName?: string | null;
    tenantSlug?: string;
  }): Promise<void> {
    if (params.newStatus === ContractStatus.ACTIVO) {
      await this.lifecycleNotificationsService.onContractActivated(
        params.id,
        params.schemaName ?? undefined,
      );
      return;
    }

    const statusNotifMap: Partial<
      Record<
        ContractStatus,
        { type: NotificationEventType; title: string; msg: string }
      >
    > = {
      [ContractStatus.FINALIZADO]: {
        type: NotificationEventType.CONTRACT_EXPIRING,
        title: 'Contrato finalizado',
        msg: 'Tu contrato ha finalizado',
      },
      [ContractStatus.CANCELADO]: {
        type: NotificationEventType.CONTRACT_EXPIRING,
        title: 'Contrato cancelado',
        msg: 'Tu contrato ha sido cancelado',
      },
    };
    const notification = statusNotifMap[params.newStatus];
    if (!notification) {
      return;
    }

    const metadata = {
      contract_id: params.id,
      new_status: params.newStatus,
    };

    if (params.schemaName) {
      await this.notificationsService.createForUserInSchema(
        params.schemaName,
        params.contract.tenant_id,
        notification.type,
        notification.title,
        notification.msg,
        metadata,
        params.tenantSlug,
      );
      return;
    }

    await this.notificationsService.createForUser(
      params.contract.tenant_id,
      notification.type,
      notification.title,
      notification.msg,
      metadata,
      params.tenantSlug,
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
