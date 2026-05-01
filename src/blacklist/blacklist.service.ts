import {
  Injectable,
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import {
  AddToBlacklistDto,
  CheckBlacklistDto,
  BlacklistCheckResponseDto,
  BlacklistAddResponseDto,
  BlacklistListResponseDto,
} from './dto/blacklist.dto';
import { BlacklistAction } from './enums/blacklist.enum';
import { TenantsService } from '../tenants/tenants.service';

interface AuditLogRow {
  id: number;
  action: string;
  tenant_id: number;
  admin_user_id: number | null;
  admin_email: string | null;
  blacklisted_tenant_id: number | null;
  document_number: string | null;
  full_name: string | null;
  ip_address: string | null;
  created_at: Date;
}

@Injectable()
export class BlacklistService {
  private readonly logger = new Logger(BlacklistService.name);

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  /**
   * Agregar inquilino a la lista negra
   * Solo ADMIN puede realizar esta acción
   */
  async addToBlacklist(
    dto: AddToBlacklistDto,
    tenantSlug: string,
    adminId: number,
    adminEmail: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<BlacklistAddResponseDto> {
    try {
      // Obtener tenant para validar que existe
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new BadRequestException('Tenant no encontrado');
      }

      // Validar que los datos no sean duplicados (mismo documento ya existe)
      const existing = await this.dataSource.query(
        `SELECT id FROM public.blacklisted_tenants 
         WHERE document_number = $1 AND document_type = $2`,
        [dto.document_number, dto.document_type],
      );

      if (existing.length > 0) {
        throw new BadRequestException(
          'Este documento ya se encuentra en la lista negra',
        );
      }

      // Insertar en tabla de blacklist
      const result = await this.dataSource.query(
        `INSERT INTO public.blacklisted_tenants 
         (full_name, document_number, document_type, reason, reported_by_tenant_id, admin_id, admin_email, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
         RETURNING id`,
        [
          dto.full_name,
          dto.document_number,
          dto.document_type,
          dto.reason,
          tenant.id,
          adminId,
          adminEmail,
        ],
      );

      const blacklistedId = result[0].id;

      // Registrar en audit log
      await this.logAuditAction(
        BlacklistAction.CREATE,
        tenant.id,
        adminId,
        adminEmail,
        blacklistedId,
        dto.document_number,
        dto.full_name,
        dto.reason,
        ipAddress,
        userAgent,
      );

      this.logger.log(
        `[BLACKLIST] Inquilino agregado: ${dto.full_name} (${dto.document_number}) por admin ${adminEmail}`,
      );

      return {
        success: true,
        id: blacklistedId,
        message: `Inquilino ${dto.full_name} agregado exitosamente a la lista negra`,
      };
    } catch (error) {
      this.logger.error(
        `Error al agregar a blacklist: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al agregar inquilino a la lista negra',
      );
    }
  }

  /**
   * Verificar si un documento está en la lista negra
   * Se puede llamar desde cualquier endpoint que necesite validar un documento
   * @param isAdmin - Si es true, retorna detalles sensibles. Si es false, solo retorna si_está_vetado
   */
  async checkBlacklist(
    dto: CheckBlacklistDto,
    tenantSlug: string,
    userId?: number,
    ipAddress?: string,
    userAgent?: string,
    isAdmin: boolean = false,
  ): Promise<BlacklistCheckResponseDto> {
    try {
      // Obtener tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new BadRequestException('Tenant no encontrado');
      }

      const documentType = dto.document_type || 'CEDULA';

      // Buscar en lista negra
      const blacklistedRecords = await this.dataSource.query(
        `SELECT 
          bt.id,
          bt.full_name,
          bt.document_number,
          bt.document_type,
          bt.reason,
          bt.reported_by_tenant_id,
          bt.created_at,
          t.company_name as reported_by_tenant_name
         FROM public.blacklisted_tenants bt
         LEFT JOIN public.tenant t ON bt.reported_by_tenant_id = t.id
         WHERE bt.document_number = $1 AND bt.document_type = $2`,
        [dto.document_number, documentType],
      );

      // Registrar check en audit log
      await this.logAuditAction(
        BlacklistAction.CHECK,
        tenant.id,
        isAdmin ? userId : null,
        null,
        blacklistedRecords.length > 0 ? blacklistedRecords[0].id : null,
        dto.document_number,
        null,
        null,
        ipAddress,
        userAgent,
      );

      if (blacklistedRecords.length > 0) {
        const record = blacklistedRecords[0];

        // Si NO es ADMIN, retorna solo la alerta sin detalles sensibles
        if (!isAdmin) {
          return {
            is_blacklisted: true,
            message: `⚠️ ALERTA: Este inquilino está en la lista negra`,
          };
        }

        // Si ES ADMIN, retorna los detalles completos
        return {
          is_blacklisted: true,
          message: `⚠️ ALERTA: Este inquilino está en la lista negra`,
          details: {
            id: record.id,
            full_name: record.full_name,
            document_number: record.document_number,
            document_type: record.document_type,
            reason: record.reason,
            reported_by_tenant_id: record.reported_by_tenant_id,
            created_at: record.created_at,
            reported_by_tenant_name: record.reported_by_tenant_name,
          },
        };
      }

      return {
        is_blacklisted: false,
        message: '✅ El documento no se encuentra en la lista negra',
      };
    } catch (error) {
      this.logger.error(
        `Error al verificar blacklist: ${error.message}`,
        error.stack,
      );
      if (error instanceof BadRequestException) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al verificar documento en lista negra',
      );
    }
  }

  /**
   * Listar todos los inquilinos en la lista negra
   * Solo ADMIN puede acceder
   */
  async listBlacklist(
    tenantSlug: string,
    adminId: number,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<BlacklistListResponseDto[]> {
    try {
      // Obtener tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new BadRequestException('Tenant no encontrado');
      }

      // Registrar acceso en audit log
      await this.logAuditAction(
        BlacklistAction.LIST,
        tenant.id,
        adminId,
        null,
        null,
        null,
        null,
        null,
        ipAddress,
        userAgent,
      );

      // Obtener lista completa
      const blacklistedRecords = await this.dataSource.query(
        `SELECT 
          bt.id,
          bt.full_name,
          bt.document_number,
          bt.document_type,
          bt.reason,
          bt.reported_by_tenant_id,
          bt.admin_email,
          bt.created_at,
          bt.updated_at,
          t.company_name as reported_by_tenant_name
         FROM public.blacklisted_tenants bt
         LEFT JOIN public.tenant t ON bt.reported_by_tenant_id = t.id
         ORDER BY bt.created_at DESC`,
      );

      return blacklistedRecords;
    } catch (error) {
      this.logger.error(
        `Error al listar blacklist: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException('Error al obtener lista negra');
    }
  }

  /**
   * Eliminar un inquilino de la lista negra
   * Solo ADMIN puede realizar esta acción
   */
  async removeFromBlacklist(
    blacklistId: number,
    tenantSlug: string,
    adminId: number,
    adminEmail: string,
    ipAddress?: string,
    userAgent?: string,
  ): Promise<BlacklistAddResponseDto> {
    try {
      // Obtener tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new BadRequestException('Tenant no encontrado');
      }

      // Obtener registro antes de eliminarlo (para auditoría)
      const record = await this.dataSource.query(
        `SELECT * FROM public.blacklisted_tenants WHERE id = $1`,
        [blacklistId],
      );

      if (record.length === 0) {
        throw new NotFoundException('Registro en lista negra no encontrado');
      }

      // Eliminar registro
      await this.dataSource.query(
        `DELETE FROM public.blacklisted_tenants WHERE id = $1`,
        [blacklistId],
      );

      // Registrar en audit log
      await this.logAuditAction(
        BlacklistAction.DELETE,
        tenant.id,
        adminId,
        adminEmail,
        blacklistId,
        record[0].document_number,
        record[0].full_name,
        record[0].reason,
        ipAddress,
        userAgent,
      );

      this.logger.log(
        `[BLACKLIST] Registro eliminado: ${record[0].full_name} por admin ${adminEmail}`,
      );

      return {
        success: true,
        message: `Registro ${record[0].full_name} eliminado de la lista negra`,
      };
    } catch (error) {
      this.logger.error(
        `Error al eliminar de blacklist: ${error.message}`,
        error.stack,
      );
      if (
        error instanceof BadRequestException ||
        error instanceof NotFoundException
      ) {
        throw error;
      }
      throw new InternalServerErrorException(
        'Error al eliminar inquilino de la lista negra',
      );
    }
  }

  /**
   * Registrar acciones en el audit log
   * Datos sensibles: solo para auditoría y cumplimiento
   */
  private async logAuditAction(
    action: string,
    tenantId: number,
    userId?: number | null,
    userEmail?: string | null,
    blacklistedTenantId?: number | null,
    documentNumber?: string | null,
    fullName?: string | null,
    reason?: string | null,
    ipAddress?: string | null,
    userAgent?: string | null,
  ): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO public.blacklist_audit_log 
         (action, tenant_id, admin_user_id, admin_email, blacklisted_tenant_id, document_number, full_name, reason, ip_address, user_agent, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())`,
        [
          action,
          tenantId,
          userId || null,
          userEmail || null,
          blacklistedTenantId || null,
          documentNumber || null,
          fullName || null,
          reason || null,
          ipAddress || null,
          userAgent || null,
        ],
      );
    } catch (error) {
      this.logger.error(
        `Error al registrar acción en audit log: ${error.message}`,
      );
      // No lanzar error para que no bloquee la operación principal
    }
  }

  /**
   * Obtener log de auditoría (solo ADMIN y datos sensibles)
   */
  async getAuditLog(
    tenantSlug: string,
    adminId: number,
    limit: number = 100,
  ): Promise<AuditLogRow[]> {
    try {
      // Obtener tenant
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      if (!tenant) {
        throw new BadRequestException('Tenant no encontrado');
      }

      this.logger.log(
        `[AUDIT] Admin ${adminId} consultando audit log del tenant ${tenantSlug}`,
      );

      return await this.dataSource.query(
        `SELECT 
          id,
          action,
          tenant_id,
          admin_user_id,
          admin_email,
          blacklisted_tenant_id,
          document_number,
          full_name,
          ip_address,
          created_at
         FROM public.blacklist_audit_log
         WHERE tenant_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [tenant.id, limit],
      );
    } catch (error) {
      this.logger.error(
        `Error al obtener audit log: ${error.message}`,
        error.stack,
      );
      throw new InternalServerErrorException(
        'Error al obtener registro de auditoría',
      );
    }
  }
}
