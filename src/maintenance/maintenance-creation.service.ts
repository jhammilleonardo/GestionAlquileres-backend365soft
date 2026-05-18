import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import type {
  IdRow,
  MaintenanceContractRow,
  MaintenanceRequestRow,
  PropertySummaryRow,
  UserNameRow,
} from './maintenance.types';

@Injectable()
export class MaintenanceCreationService {
  private readonly logger = new Logger(MaintenanceCreationService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly maintenanceLookupService: MaintenanceLookupService,
  ) {}

  async create(
    createMaintenanceDto: CreateMaintenanceDto,
    tenantId: number,
    contractId: number | undefined,
    assignedTo: number,
  ): Promise<MaintenanceRequestRow> {
    const contract = await this.resolveContract(contractId, tenantId);
    const propertyId = contract.property_id;
    const finalContractId = contract.id;
    const category =
      createMaintenanceDto.request_type === 'GENERAL'
        ? undefined
        : createMaintenanceDto.category;

    const savedRequest = await runTenantTransaction(
      this.dataSource,
      async (queryRunner) => {
        const result = this.asRows<MaintenanceRequestRow>(
          await queryRunner.query(
            `INSERT INTO maintenance_requests(
            ticket_number, request_type, category, title, description,
            permission_to_enter, has_pets, entry_notes,
            tenant_id, property_id, contract_id, assigned_to
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          RETURNING *`,
            [
              this.generateTicketNumber(),
              createMaintenanceDto.request_type,
              category,
              createMaintenanceDto.title,
              createMaintenanceDto.description,
              createMaintenanceDto.permission_to_enter || 'NOT_APPLICABLE',
              createMaintenanceDto.has_pets || false,
              createMaintenanceDto.entry_notes || null,
              tenantId,
              propertyId,
              finalContractId,
              assignedTo,
            ],
          ),
        );

        const request = result[0];
        if (!request) {
          throw new Error('No se pudo crear la solicitud de mantenimiento');
        }

        if (
          createMaintenanceDto.files &&
          createMaintenanceDto.files.length > 0
        ) {
          for (const fileUrl of createMaintenanceDto.files) {
            await queryRunner.query(
              `INSERT INTO maintenance_attachments(
                maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by
              ) VALUES ($1, $2, $3, $4, $5, $6)`,
              [
                request.id,
                fileUrl,
                fileUrl.split('/').pop() || 'unknown',
                this.getFileType(fileUrl),
                0,
                tenantId,
              ],
            );
          }
        }

        return request;
      },
    );

    await this.notifyRequestCreated(
      savedRequest,
      createMaintenanceDto,
      tenantId,
      assignedTo,
      propertyId,
      finalContractId,
    );

    return this.maintenanceLookupService.findOne(savedRequest.id);
  }

  private async resolveContract(
    contractId: number | undefined,
    tenantId: number,
  ): Promise<MaintenanceContractRow> {
    if (!contractId) {
      const activeContracts = await this.dataSource.query<
        MaintenanceContractRow[]
      >(
        `SELECT c.*, p.id as property_id, p.title as property_title
         FROM contracts c
         LEFT JOIN properties p ON c.property_id = p.id
         WHERE c.tenant_id = $1 AND c.status IN ($2, $3)
         LIMIT 1`,
        [tenantId, ContractStatus.ACTIVO, ContractStatus.POR_VENCER],
      );

      if (!activeContracts || activeContracts.length === 0) {
        throw new BadRequestException(
          'No tienes un contrato activo. Para crear solicitudes de mantenimiento, debes tener un contrato activo.',
        );
      }

      const contract = activeContracts[0];
      this.logger.debug(
        `Contrato activo encontrado automaticamente para mantenimiento: ${contract.contract_number}`,
      );
      return contract;
    }

    const contracts = await this.dataSource.query<MaintenanceContractRow[]>(
      `SELECT c.*, p.id as property_id, p.title as property_title
       FROM contracts c
       LEFT JOIN properties p ON c.property_id = p.id
       WHERE c.id = $1`,
      [contractId],
    );

    if (!contracts || contracts.length === 0) {
      throw new NotFoundException('Contrato no encontrado');
    }

    const contract = contracts[0];
    const activeStatuses = [ContractStatus.ACTIVO, ContractStatus.POR_VENCER];
    if (!activeStatuses.includes(contract.status)) {
      throw new BadRequestException(
        `Solo se pueden crear solicitudes de mantenimiento para contratos activos. Estado actual: ${contract.status}`,
      );
    }

    if (contract.tenant_id !== tenantId) {
      throw new ForbiddenException(
        'No tienes permiso para crear solicitudes de mantenimiento para este contrato',
      );
    }

    return contract;
  }

  private async notifyRequestCreated(
    savedRequest: MaintenanceRequestRow,
    createMaintenanceDto: CreateMaintenanceDto,
    tenantId: number,
    assignedTo: number,
    propertyId: number,
    finalContractId: number,
  ): Promise<void> {
    try {
      let targetUserId = assignedTo;
      if (!targetUserId) {
        const admins = await this.dataSource.query<IdRow[]>(
          `SELECT id FROM "user" WHERE role = 'ADMIN'`,
        );

        if (admins.length > 0) {
          targetUserId = admins[0].id;
          this.logger.debug(
            `Admin asignado automaticamente para notificacion de mantenimiento: ${targetUserId}`,
          );
        } else {
          this.logger.warn(
            `No hay admins para notificar la solicitud de mantenimiento ${savedRequest.id}`,
          );
        }
      }

      if (!targetUserId) {
        return;
      }

      const propertyInfo = await this.dataSource.query<PropertySummaryRow[]>(
        `SELECT id, title FROM properties WHERE id = $1`,
        [propertyId],
      );
      const property = propertyInfo[0];

      const tenantInfo = await this.dataSource.query<UserNameRow[]>(
        `SELECT name FROM "user" WHERE id = $1`,
        [tenantId],
      );
      const tenantName = tenantInfo[0]?.name || 'Inquilino';

      await this.notificationsService.createForUser(
        targetUserId,
        NotificationEventType.MAINTENANCE_REQUEST_CREATED,
        'Nueva solicitud de mantenimiento',
        `${tenantName} ha creado una nueva solicitud: ${createMaintenanceDto.title}`,
        {
          ticket_number: savedRequest.ticket_number,
          maintenance_request_id: savedRequest.id,
          contract_id: finalContractId,
          property_id: propertyId,
          property_title: property?.title,
          category: savedRequest.category,
          priority: savedRequest.priority,
          description: createMaintenanceDto.description,
        },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Error al crear notificacion de mantenimiento: ${this.getErrorMessage(error)}`,
        this.getErrorStack(error),
      );
    }
  }

  private generateTicketNumber(): string {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `MNT-${year}-${random}`;
  }

  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const pdfExts = ['pdf'];

    if (imageExts.includes(ext)) return 'image';
    if (pdfExts.includes(ext)) return 'pdf';
    return 'unknown';
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }

  private asRows<T>(value: unknown): T[] {
    return Array.isArray(value) ? (value as T[]) : [];
  }
}
