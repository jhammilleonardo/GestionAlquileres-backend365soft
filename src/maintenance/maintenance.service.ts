import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { MaintenanceFiltersDto } from './dto/maintenance-filters.dto';
import { MaintenanceCreationService } from './maintenance-creation.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { MaintenanceMessagesService } from './maintenance-messages.service';
import { MaintenanceStageService } from './maintenance-stage.service';
import { MaintenanceStatsService } from './maintenance-stats.service';
import { MaintenanceUpdateService } from './maintenance-update.service';
import { MaintenanceVendorsService } from './maintenance-vendors.service';
import type {
  MaintenanceAttachmentRow,
  MaintenanceMessageRow,
  MaintenanceRequestRow,
  MaintenanceStageHistoryRow,
  MaintenanceStats,
  TenantMaintenanceStats,
} from './maintenance.types';

@Injectable()
export class MaintenanceService {
  constructor(
    private dataSource: DataSource,
    private maintenanceCreationService: MaintenanceCreationService,
    private maintenanceLookupService: MaintenanceLookupService,
    private maintenanceMessagesService: MaintenanceMessagesService,
    private maintenanceStageService: MaintenanceStageService,
    private maintenanceStatsService: MaintenanceStatsService,
    private maintenanceUpdateService: MaintenanceUpdateService,
    private maintenanceVendorsService: MaintenanceVendorsService,
  ) {}

  /**
   * Crea una nueva solicitud de mantenimiento
   */
  async create(
    createMaintenanceDto: CreateMaintenanceDto,
    tenantId: number,
    contractId: number | undefined,
    assignedTo: number,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceCreationService.create(
      createMaintenanceDto,
      tenantId,
      contractId,
      assignedTo,
    );
  }

  /**
   * Obtiene todas las solicitudes (admin) con filtros
   */
  async findAll(
    filters?: MaintenanceFiltersDto,
  ): Promise<MaintenanceRequestRow[]> {
    return this.maintenanceLookupService.findAll(filters);
  }

  /**
   * Obtiene las solicitudes de un inquilino específico
   */
  async findByTenant(tenantId: number): Promise<MaintenanceRequestRow[]> {
    return this.maintenanceLookupService.findByTenant(tenantId);
  }

  /**
   * Obtiene una solicitud por ID con todos sus detalles
   */
  async findOne(id: number): Promise<MaintenanceRequestRow> {
    return this.maintenanceLookupService.findOne(id);
  }

  /**
   * Actualiza una solicitud
   */
  async update(
    id: number,
    updateMaintenanceDto: UpdateMaintenanceDto,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceUpdateService.update(id, updateMaintenanceDto);
  }

  /**
   * Elimina una solicitud
   */
  async remove(id: number): Promise<void> {
    await this.dataSource.query(
      `DELETE FROM maintenance_requests WHERE id = $1`,
      [id],
    );
  }

  /**
   * Agrega un mensaje a una solicitud
   */
  async addMessage(
    requestId: number,
    createMessageDto: CreateMessageDto,
    userId: number,
  ): Promise<MaintenanceMessageRow> {
    return this.maintenanceMessagesService.addMessage(
      requestId,
      createMessageDto,
      userId,
    );
  }

  /**
   * Obtiene los mensajes de una solicitud
   */
  async getMessages(
    requestId: number,
    userId?: number,
  ): Promise<MaintenanceMessageRow[]> {
    return this.maintenanceLookupService.getMessages(requestId, userId);
  }

  /**
   * Obtiene estadísticas para el dashboard del admin
   */
  async getAdminStats(): Promise<MaintenanceStats> {
    return this.maintenanceStatsService.getAdminStats();
  }

  /**
   * Obtiene estadísticas para el dashboard del inquilino
   */
  async getTenantStats(tenantId: number): Promise<TenantMaintenanceStats> {
    return this.maintenanceStatsService.getTenantStats(tenantId);
  }

  /**
   * Guarda los archivos subidos vía multer como attachments de una solicitud
   */
  async saveUploadedFiles(
    requestId: number,
    files: Express.Multer.File[],
    userId: number,
    tenantSlug: string,
  ): Promise<MaintenanceAttachmentRow[]> {
    return this.maintenanceMessagesService.saveUploadedFiles(
      requestId,
      files,
      userId,
      tenantSlug,
    );
  }

  // ─── Stage Pipeline ─────────────────────────────────────────────────────────

  /**
   * Valida si la transición de etapas sigue el orden secuencial definido.
   * Solo permite avanzar una etapa a la vez.
   */
  isValidStageTransition(from: string, to: string): boolean {
    return this.maintenanceStageService.isValidStageTransition(from, to);
  }

  /**
   * Valida si una etapa es permitida para que un técnico la establezca.
   */
  isTechnicianAllowedTarget(toStage: string): boolean {
    return this.maintenanceStageService.isTechnicianAllowedTarget(toStage);
  }

  /**
   * Retorna el historial de etapas de una solicitud, ordenado cronológicamente.
   */
  async getStageHistory(
    requestId: number,
  ): Promise<MaintenanceStageHistoryRow[]> {
    return this.maintenanceStageService.getStageHistory(requestId);
  }

  /**
   * Cambia la etapa de una solicitud validando la secuencia y reglas de negocio.
   * Bolivia-only: para avanzar a IN_PROGRESS el propietario debe haber autorizado.
   */
  async changeStage(
    requestId: number,
    toStage: string,
    userId: number,
    notes?: string,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceStageService.changeStage(
      requestId,
      toStage,
      userId,
      notes,
    );
  }

  /**
   * Variante restringida para técnicos: solo IN_PROGRESS y COMPLETED permitidos.
   */
  async changeStageAsTechnician(
    requestId: number,
    toStage: string,
    userId: number,
    notes?: string,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceStageService.changeStageAsTechnician(
      requestId,
      toStage,
      userId,
      notes,
    );
  }

  /**
   * Guarda fotos del trabajo técnico y las adjunta al último registro del historial.
   */
  async saveStagePhotos(
    requestId: number,
    files: Express.Multer.File[],
    userId: number,
    slug: string,
  ): Promise<Array<{ file_url: string }>> {
    return this.maintenanceStageService.saveStagePhotos(
      requestId,
      files,
      userId,
      slug,
    );
  }

  /**
   * Propietario autoriza el gasto de mantenimiento antes de IN_PROGRESS.
   * Requerido solo en Bolivia (validado en changeStage).
   */
  async authorizeWork(requestId: number, ownerId: number): Promise<void> {
    return this.maintenanceStageService.authorizeWork(requestId, ownerId);
  }

  private getErrorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private getErrorStack(error: unknown): string | undefined {
    return error instanceof Error ? error.stack : undefined;
  }

  // ─── Vendors ──────────────────────────────────────────────────────────────

  async assignVendor(
    requestId: number,
    vendorId: number | null,
    assignedTo: number | null,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceVendorsService.assignVendor(
      requestId,
      vendorId,
      assignedTo,
    );
  }

  async rateVendor(
    requestId: number,
    rating: number,
    comment: string | undefined,
    userId: number,
  ): Promise<MaintenanceRequestRow> {
    return this.maintenanceVendorsService.rateVendor(
      requestId,
      rating,
      comment,
      userId,
    );
  }
}
