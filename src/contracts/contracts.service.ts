import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { ContractStatus } from './enums/contract-status.enum';
import { PdfService } from './pdf.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { LifecycleNotificationsService } from '../lifecycle-notifications/lifecycle-notifications.service';
import {
  ContractTemplateRow,
  ContractTemplatesService,
} from '../contract-templates/contract-templates.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { RenewContractDto } from './dto/renew-contract.dto';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';
import { basename } from 'path';
import { storageService } from '../common/storage/storage.service';
import {
  ContractFilters,
  ContractQueriesService,
} from './contract-queries.service';
import { ContractHistoryService } from './contract-history.service';
import { ContractRenewalService } from './contract-renewal.service';
import { ContractSigningService } from './contract-signing.service';
import {
  ContractCreatedSideEffectsParams,
  ContractCreationService,
  CreateContractOptions,
} from './contract-creation.service';

export interface ContractResult {
  id: number;
  contract_number: string;
  tenant_id: number;
  property_id: number;
  start_date: string | Date;
  end_date: string | Date;
  duration_months?: number | null;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  deposit_amount: number;
  payment_method?: string | null;
  late_fee_percentage?: number | null;
  grace_days?: number | null;
  unit_id?: number | null;
  included_services?: string[] | string | null;
  tenant_responsibilities?: string | null;
  owner_responsibilities?: string | null;
  prohibitions?: string | null;
  coexistence_rules?: string | null;
  renewal_terms?: string | null;
  termination_terms?: string | null;
  jurisdiction?: string | null;
  auto_renew?: boolean | null;
  renewal_notice_days?: number | null;
  auto_increase_percentage?: number | null;
  bank_account_number?: string | null;
  bank_account_type?: string | null;
  bank_name?: string | null;
  bank_account_holder?: string | null;
  status: ContractStatus;
  terms_conditions?: string | null;
  created_at: Date;
  updated_at: Date;
  // Campos de JOIN — SQL retorna null cuando no hay coincidencia
  property_title?: string | null;
  property_description?: string | null;
  property_status?: string | null;
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  zip_code?: string | null;
  country?: string | null;
  tenant_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
}

export interface ContractPdfResult {
  path?: string;
  url: string;
  fullUrl: string;
}

@Injectable()
export class ContractsService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
    private pdfService: PdfService,
    private notificationsService: NotificationsService,
    private lifecycleNotificationsService: LifecycleNotificationsService,
    private contractTemplatesService: ContractTemplatesService,
    private auditLogsService: AuditLogsService,
    private tenantsService: TenantsService,
    private contractQueriesService: ContractQueriesService,
    private contractCreationService: ContractCreationService,
    private contractHistoryService: ContractHistoryService,
    private contractRenewalService: ContractRenewalService,
    private contractSigningService: ContractSigningService,
  ) {}

  async create(
    createContractDto: CreateContractDto,
    adminUserId?: number,
    tenantSlug?: string,
    options: CreateContractOptions = {},
  ) {
    return this.contractCreationService.create(
      createContractDto,
      adminUserId,
      tenantSlug,
      options,
    );
  }

  async emitContractCreatedSideEffects(
    params: ContractCreatedSideEffectsParams,
  ): Promise<void> {
    return this.contractCreationService.emitCreatedSideEffects(params);
  }

  async findAll(filters: ContractFilters, tenantSlug?: string) {
    return this.contractQueriesService.findAll(filters, tenantSlug);
  }

  async findOne(id: number, tenantSlug?: string) {
    return this.contractQueriesService.findOne(id, tenantSlug);
  }

  async update(
    id: number,
    updateContractDto: UpdateContractDto,
    userId: number = 0,
    tenantSlug?: string,
  ) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    // Construir query de actualización dinámicamente
    const updates: string[] = [];
    const values: (string | number | boolean | null)[] = [];
    let paramCount = 0;

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
      if (val !== undefined && fieldMapping[key]) {
        paramCount++;
        const field = fieldMapping[key];

        if (key === 'included_services') {
          updates.push(`${field} = $${paramCount}`);
          values.push(JSON.stringify(val));
        } else if (key === 'auto_renew') {
          updates.push(`${field} = $${paramCount}`);
          values.push(!!val);
        } else {
          updates.push(`${field} = $${paramCount}`);
          values.push(val as string | number | boolean | null);
        }
      }
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let contract: ContractResult;
    let oldStatus: ContractStatus;
    let statusChanged = false;

    try {
      contract = await this.lockContractForUpdate(
        queryRunner,
        schemaPrefix,
        id,
      );
      oldStatus = contract.status;
      statusChanged =
        updateContractDto.status !== undefined &&
        updateContractDto.status !== oldStatus;

      if (updates.length > 0) {
        paramCount++;
        updates.push(`updated_at = NOW()`);

        const query = `UPDATE ${schemaPrefix}contracts SET ${updates.join(', ')} WHERE id = $${paramCount}`;
        values.push(id);

        await queryRunner.query(query, values);
      }

      if (statusChanged && updateContractDto.status) {
        await this.logHistory(
          id,
          'status',
          oldStatus,
          updateContractDto.status,
          userId,
          updateContractDto.update_reason || 'Cambio de estado',
          schemaName,
          queryRunner,
        );

        // Si pasa a ACTIVO, marcar la propiedad como OCUPADA
        if (updateContractDto.status === ContractStatus.ACTIVO) {
          await queryRunner.query(
            `UPDATE ${schemaPrefix}properties SET status = 'OCUPADO' WHERE id = $1`,
            [contract.property_id],
          );
        }

        // Si pasa a FINALIZADO, marcar como DISPONIBLE
        if (
          [
            ContractStatus.FINALIZADO,
            ContractStatus.VENCIDO,
            ContractStatus.CANCELADO,
          ].includes(updateContractDto.status)
        ) {
          await queryRunner.query(
            `UPDATE ${schemaPrefix}properties SET status = 'DISPONIBLE' WHERE id = $1`,
            [contract.property_id],
          );
        }
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    // Recargar para obtener el contrato actualizado
    const updatedContract = await this.findOne(id, tenantSlug);

    if (statusChanged && updateContractDto.status) {
      // Notificar al inquilino sobre el cambio de estado relevante
      try {
        if (updateContractDto.status === ContractStatus.ACTIVO) {
          await this.lifecycleNotificationsService.onContractActivated(
            id,
            schemaName ?? undefined,
          );
        } else {
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
          const notif = statusNotifMap[updateContractDto.status];
          if (notif) {
            if (schemaName) {
              await this.notificationsService.createForUserInSchema(
                schemaName,
                contract.tenant_id,
                notif.type,
                notif.title,
                notif.msg,
                { contract_id: id, new_status: updateContractDto.status },
                tenantSlug,
              );
            } else {
              await this.notificationsService.createForUser(
                contract.tenant_id,
                notif.type,
                notif.title,
                notif.msg,
                { contract_id: id, new_status: updateContractDto.status },
                tenantSlug,
              );
            }
          }
        }
      } catch {
        // No propagar errores de notificación
      }

      await this.auditLogsService.log({
        userId,
        action: AuditAction.STATUS_CHANGED,
        entityType: 'contract',
        entityId: id,
        oldValues: { status: contract.status },
        newValues: {
          status: updateContractDto.status,
          reason: updateContractDto.update_reason,
        },
      });
    }

    return updatedContract;
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

  async signContract(
    id: number,
    userId: number,
    ip: string,
    tenantSlug?: string,
  ) {
    return this.contractSigningService.signContract(id, userId, ip, tenantSlug);
  }

  async getMetrics(tenantSlug?: string) {
    return this.contractQueriesService.getMetrics(tenantSlug);
  }

  private async logHistory(
    contractId: number,
    field: string,
    oldValue: unknown,
    newValue: unknown,
    userId: number,
    reason?: string,
    schemaName?: string | null,
    queryRunner?: QueryRunner,
  ) {
    await this.contractHistoryService.logChange({
      contractId,
      field,
      oldValue,
      newValue,
      userId,
      reason,
      schemaName,
      queryRunner,
    });
  }

  async generatePdf(
    id: number,
    tenantSlug: string,
    baseUrl: string = '',
  ): Promise<ContractPdfResult> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    const contract = await this.findOne(id, tenantSlug);

    // Información del tenant (empresa arrendadora) desde schema public
    const tenantInfo = await this.dataSource.query<
      { company_name: string; logo_url?: string }[]
    >('SELECT company_name, logo_url FROM public.tenant WHERE slug = $1', [
      tenantSlug,
    ]);
    const landlordName =
      tenantInfo[0]?.company_name ?? 'Empresa Administradora';

    // Detectar idioma del tenant para seleccionar plantilla
    const configRows = await this.dataSource.query<{ language: string }[]>(
      `SELECT language FROM ${schemaPrefix}tenant_config LIMIT 1`,
    );
    const language = configRows[0]?.language ?? 'es';

    // Intentar usar plantilla configurable; si no existe, usar generador hardcodeado
    const [template] = await this.dataSource.query<ContractTemplateRow[]>(
      `SELECT * FROM ${schemaPrefix}contract_templates
       WHERE language = $1 AND is_active = true
       ORDER BY created_at DESC
       LIMIT 1`,
      [language],
    );

    let pdfPath: string;

    if (template) {
      const fullAddress = [
        contract.street_address,
        contract.city,
        contract.state,
        contract.country,
      ]
        .filter(Boolean)
        .join(', ');

      // Obtener número de unidad si el contrato tiene unit_id
      let unitNumber = '';
      if (contract.unit_id) {
        const unitRows = await this.dataSource.query<{ unit_number: string }[]>(
          `SELECT unit_number FROM ${schemaPrefix}units WHERE id = $1`,
          [contract.unit_id],
        );
        unitNumber = unitRows[0]?.unit_number ?? '';
      }

      const vars = {
        contract_number: contract.contract_number ?? '',
        tenant_name: contract.tenant_name ?? '',
        tenant_email: contract.tenant_email ?? '',
        tenant_phone: contract.tenant_phone ?? '',
        property_title: contract.property_title ?? '',
        property_address: fullAddress || 'No especificada',
        unit_number: unitNumber,
        rent_amount: String(contract.monthly_rent ?? 0),
        currency: contract.currency ?? '',
        start_date: new Date(contract.start_date).toLocaleDateString(),
        end_date: new Date(contract.end_date).toLocaleDateString(),
        payment_day: String(contract.payment_day ?? 5),
        deposit_amount: String(contract.deposit_amount ?? 0),
        late_fee_percentage: String(contract.late_fee_percentage ?? 0),
        grace_days: String(contract.grace_days ?? 0),
        jurisdiction: contract.jurisdiction ?? '',
        duration_months: String(contract.duration_months ?? 12),
        landlord_name: landlordName,
        issue_date: new Date().toLocaleDateString(),
      };

      const populated = this.contractTemplatesService.substituteVariables(
        template.content,
        vars,
      );
      pdfPath = await this.pdfService.generateContractPdfFromTemplate(
        contract.contract_number,
        populated,
      );
    } else {
      pdfPath = await this.pdfService.generateContractPdf(contract, {
        name: landlordName,
        address: 'Dirección de la administración',
      });
    }

    const fileName = basename(pdfPath);
    const storagePath = storageService.buildStoragePath(
      'contracts',
      tenantSlug,
      String(id),
      fileName,
    );
    await storageService.uploadLocalFile(
      pdfPath,
      storagePath,
      'application/pdf',
      'private',
      true,
    );

    const pdfUrl = storageService.toRoutePath(storagePath);
    const fullPdfUrl = storageService.isS3Enabled()
      ? await storageService.getSignedReadUrl(storagePath, 300)
      : `${baseUrl}${pdfUrl}`;

    await this.dataSource.query(
      `UPDATE ${schemaPrefix}contracts SET pdf_url = $1 WHERE id = $2`,
      [pdfUrl, id],
    );

    return {
      path: storageService.isS3Enabled() ? undefined : pdfPath,
      url: pdfUrl,
      fullUrl: fullPdfUrl,
    };
  }

  async renew(
    id: number,
    dto: RenewContractDto = {},
    userId: number = 0,
    tenantSlug?: string,
  ): Promise<ContractResult> {
    return this.contractRenewalService.renew(id, dto, userId, tenantSlug);
  }

  async getContractHistory(
    id: number,
    tenantSlug?: string,
  ): Promise<ContractResult[]> {
    return this.contractQueriesService.getContractHistory(id, tenantSlug);
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
