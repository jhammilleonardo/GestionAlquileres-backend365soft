import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';

export interface ContractCreatedSideEffectsParams {
  adminUserId?: number;
  contract: { id: number; tenant_id: number; property_id: number };
  contractNumber: string;
  createContractDto: CreateContractDto;
  schemaName?: string | null;
  schemaPrefix: string;
  tenantSlug?: string;
}

@Injectable()
export class ContractCreationSideEffectsService {
  private readonly logger = new Logger(ContractCreationSideEffectsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async emitCreated(params: ContractCreatedSideEffectsParams): Promise<void> {
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
      await this.notifyTenant(params);
      await this.notifyAdmins(params);
    } catch (error) {
      this.logger.warn(
        `No se pudieron emitir notificaciones de contrato creado ${params.contract.id}: ${String(error)}`,
      );
    }
  }

  private async notifyTenant(
    params: ContractCreatedSideEffectsParams,
  ): Promise<void> {
    const tenantId = params.createContractDto.tenant_id;
    const metadata = {
      contract_id: params.contract.id,
      contract_number: params.contractNumber,
    };

    if (params.schemaName) {
      await this.notificationsService.createForUserInSchema(
        params.schemaName,
        tenantId,
        NotificationEventType.CONTRACT_CREATED,
        'Nuevo contrato disponible',
        `Se ha creado el contrato ${params.contractNumber}. Por favor revísalo y fírmalo.`,
        metadata,
        params.tenantSlug,
      );
      return;
    }

    await this.notificationsService.createForUser(
      tenantId,
      NotificationEventType.CONTRACT_CREATED,
      'Nuevo contrato disponible',
      `Se ha creado el contrato ${params.contractNumber}. Por favor revísalo y fírmalo.`,
      metadata,
      params.tenantSlug,
    );
  }

  private async notifyAdmins(
    params: ContractCreatedSideEffectsParams,
  ): Promise<void> {
    const admins = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM ${params.schemaPrefix}"user" WHERE role = 'ADMIN' LIMIT 5`,
    );
    const adminIds = admins.map((admin) => admin.id);
    if (adminIds.length === 0) {
      return;
    }

    await Promise.all(
      adminIds.map((adminId) => this.notifyAdmin(params, adminId)),
    );
  }

  private async notifyAdmin(
    params: ContractCreatedSideEffectsParams,
    adminId: number,
  ): Promise<void> {
    const tenantId = params.createContractDto.tenant_id;
    const metadata = {
      contract_id: params.contract.id,
      contract_number: params.contractNumber,
    };

    if (params.schemaName) {
      await this.notificationsService.createForUserInSchema(
        params.schemaName,
        adminId,
        NotificationEventType.CONTRACT_CREATED,
        'Nuevo contrato creado',
        `Se ha creado el contrato ${params.contractNumber} para el inquilino ID ${tenantId}`,
        metadata,
        params.tenantSlug,
      );
      return;
    }

    await this.notificationsService.createForUser(
      adminId,
      NotificationEventType.CONTRACT_CREATED,
      'Nuevo contrato creado',
      `Se ha creado el contrato ${params.contractNumber} para el inquilino ID ${tenantId}`,
      metadata,
      params.tenantSlug,
    );
  }
}
