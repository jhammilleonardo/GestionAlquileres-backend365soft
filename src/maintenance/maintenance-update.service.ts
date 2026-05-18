import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import type { MaintenanceRequestRow } from './maintenance.types';

type QueryParam = string | number | boolean | null | Date;

@Injectable()
export class MaintenanceUpdateService {
  private readonly logger = new Logger(MaintenanceUpdateService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly maintenanceLookupService: MaintenanceLookupService,
  ) {}

  async update(
    id: number,
    updateMaintenanceDto: UpdateMaintenanceDto,
  ): Promise<MaintenanceRequestRow> {
    const currentRequest = await this.maintenanceLookupService.findOne(id);
    const oldStatus = currentRequest.status;
    const oldAssignedTo = currentRequest.assigned_to;

    const { updates, params, paramIndex } =
      this.buildUpdateSet(updateMaintenanceDto);

    if (updates.length === 0) {
      return this.maintenanceLookupService.findOne(id);
    }

    params.push(id);

    await this.dataSource.query(
      `UPDATE maintenance_requests
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}`,
      params,
    );

    await this.notifyUpdate(
      id,
      updateMaintenanceDto,
      currentRequest,
      oldStatus,
      oldAssignedTo,
    );

    return this.maintenanceLookupService.findOne(id);
  }

  private buildUpdateSet(updateMaintenanceDto: UpdateMaintenanceDto): {
    updates: string[];
    params: QueryParam[];
    paramIndex: number;
  } {
    const updateColumns: Record<keyof UpdateMaintenanceDto, string> = {
      status: 'status',
      priority: 'priority',
      due_date: 'due_date',
      assigned_to: 'assigned_to',
    };

    const updates: string[] = [];
    const params: QueryParam[] = [];
    let paramIndex = 1;

    Object.entries(updateColumns).forEach(([key, columnName]) => {
      const value = updateMaintenanceDto[key as keyof UpdateMaintenanceDto];
      if (value !== undefined) {
        updates.push(`${columnName} = $${paramIndex++}`);
        params.push(value);
      }
    });

    return { updates, params, paramIndex };
  }

  private async notifyUpdate(
    id: number,
    updateMaintenanceDto: UpdateMaintenanceDto,
    currentRequest: MaintenanceRequestRow,
    oldStatus: MaintenanceRequestRow['status'],
    oldAssignedTo: number | null,
  ): Promise<void> {
    try {
      if (
        updateMaintenanceDto.status &&
        updateMaintenanceDto.status !== oldStatus
      ) {
        await this.notificationsService.createForUser(
          currentRequest.tenant_id,
          NotificationEventType.MAINTENANCE_STATUS_CHANGED,
          'Estado de solicitud actualizado',
          `Tu solicitud ${currentRequest.ticket_number} ha cambiado de ${oldStatus} a ${updateMaintenanceDto.status}`,
          {
            ticket_number: currentRequest.ticket_number,
            maintenance_request_id: id,
            contract_id: currentRequest.contract_id,
            old_status: oldStatus,
            new_status: updateMaintenanceDto.status,
            property_title: currentRequest.property?.title,
          },
        );
      }

      if (
        updateMaintenanceDto.assigned_to &&
        updateMaintenanceDto.assigned_to !== oldAssignedTo
      ) {
        await this.notificationsService.createForUser(
          updateMaintenanceDto.assigned_to,
          NotificationEventType.MAINTENANCE_ASSIGNED,
          'Solicitud asignada',
          `Se te ha asignado la solicitud ${currentRequest.ticket_number}: ${currentRequest.title}`,
          {
            ticket_number: currentRequest.ticket_number,
            maintenance_request_id: id,
            contract_id: currentRequest.contract_id,
            property_title: currentRequest.property?.title,
            priority: currentRequest.priority,
          },
        );
      }

      if (
        updateMaintenanceDto.status === 'COMPLETED' &&
        oldStatus !== 'COMPLETED'
      ) {
        await this.notificationsService.createForUser(
          currentRequest.tenant_id,
          NotificationEventType.MAINTENANCE_COMPLETED,
          'Solicitud completada',
          `La solicitud ${currentRequest.ticket_number} ha sido marcada como completada`,
          {
            ticket_number: currentRequest.ticket_number,
            maintenance_request_id: id,
            contract_id: currentRequest.contract_id,
            property_title: currentRequest.property?.title,
          },
        );
      }
    } catch (error: unknown) {
      this.logger.error(
        `Error al crear notificacion de mantenimiento: ${this.getErrorMessage(error)}`,
        this.getErrorStack(error),
      );
    }
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }
}
