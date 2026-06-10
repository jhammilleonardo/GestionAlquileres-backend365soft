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
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { TenantsService } from '../tenants/tenants.service';
import type { ContractResult } from './contracts.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractQueriesService } from './contract-queries.service';
import { ContractStatus } from './enums/contract-status.enum';

/** Evidencia de firma electrónica capturada del firmante (modelo eSignature). */
export interface SignatureEvidence {
  signatureImage: string;
  signatureMethod?: string;
  userAgent?: string;
}

@Injectable()
export class ContractSigningService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly contractQueriesService: ContractQueriesService,
    private readonly contractHistoryService: ContractHistoryService,
    private readonly notificationsService: NotificationsService,
    private readonly lifecycleNotificationsService: LifecycleNotificationsService,
    private readonly auditLogsService: AuditLogsService,
    private readonly tenantsService: TenantsService,
  ) {}

  async signContract(
    id: number,
    userId: number,
    ip: string,
    tenantSlug?: string,
    signature?: SignatureEvidence,
  ): Promise<ContractResult> {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let contract: ContractResult;
    let oldStatus = ContractStatus.BORRADOR;

    try {
      contract = await this.lockContractForSigning(
        queryRunner,
        schemaPrefix,
        id,
      );

      if (contract.tenant_id !== userId) {
        throw new BadRequestException(
          'No tienes permiso para firmar este contrato',
        );
      }

      if (
        contract.status !== ContractStatus.BORRADOR &&
        contract.status !== ContractStatus.PENDIENTE
      ) {
        throw new BadRequestException(
          'El contrato no está en un estado que permita firma',
        );
      }

      oldStatus = contract.status;

      await queryRunner.query(
        `UPDATE ${schemaPrefix}contracts
         SET status = $1,
             tenant_signature_date = NOW(),
             activation_date = NOW(),
             signed_ip = $2,
             is_signed = true,
             signature_image = $3,
             signature_method = $4,
             signed_user_agent = $5,
             updated_at = NOW()
         WHERE id = $6`,
        [
          ContractStatus.ACTIVO,
          ip,
          signature?.signatureImage ?? null,
          signature?.signatureMethod ?? null,
          signature?.userAgent ?? null,
          id,
        ],
      );

      await this.contractHistoryService.logChange({
        contractId: id,
        field: 'status',
        oldValue: oldStatus,
        newValue: ContractStatus.ACTIVO,
        userId,
        reason: 'Firma digital del inquilino (Aceptación de términos)',
        schemaName,
        queryRunner,
      });

      await queryRunner.query(
        `UPDATE ${schemaPrefix}properties SET status = 'OCUPADO' WHERE id = $1`,
        [contract.property_id],
      );

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    await this.notifyAdmins({
      schemaPrefix,
      schemaName,
      tenantSlug,
      contractId: id,
      userId,
    });

    await this.notifyContractActivated(id, schemaName);

    await this.auditLogsService.log({
      userId,
      action: AuditAction.SIGNED,
      entityType: 'contract',
      entityId: id,
      oldValues: { status: oldStatus },
      newValues: {
        status: ContractStatus.ACTIVO,
        signature_method: signature?.signatureMethod ?? null,
        signed_user_agent: signature?.userAgent ?? null,
      },
      ipAddress: ip,
    });

    return this.contractQueriesService.findOne(id, tenantSlug);
  }

  private async lockContractForSigning(
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

  private async notifyAdmins(params: {
    schemaPrefix: string;
    schemaName: string | null;
    tenantSlug?: string;
    contractId: number;
    userId: number;
  }): Promise<void> {
    try {
      const admins = await this.dataSource.query<{ id: number }[]>(
        `SELECT id FROM ${params.schemaPrefix}"user" WHERE role = 'ADMIN' LIMIT 5`,
      );
      const adminIds = admins.map((admin) => admin.id);

      await Promise.all(
        adminIds.map((adminId) =>
          params.schemaName
            ? this.notificationsService.createForUserInSchema(
                params.schemaName,
                adminId,
                NotificationEventType.CONTRACT_SIGNED,
                'Contrato firmado',
                `El inquilino ID ${params.userId} ha firmado el contrato ID ${params.contractId}`,
                { contract_id: params.contractId },
                params.tenantSlug,
              )
            : this.notificationsService.createForUser(
                adminId,
                NotificationEventType.CONTRACT_SIGNED,
                'Contrato firmado',
                `El inquilino ID ${params.userId} ha firmado el contrato ID ${params.contractId}`,
                { contract_id: params.contractId },
                params.tenantSlug,
              ),
        ),
      );
    } catch {
      // No propagar errores de notificación.
    }
  }

  private async notifyContractActivated(
    contractId: number,
    schemaName: string | null,
  ): Promise<void> {
    try {
      await this.lifecycleNotificationsService.onContractActivated(
        contractId,
        schemaName ?? undefined,
      );
    } catch {
      // No propagar errores de notificación.
    }
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
