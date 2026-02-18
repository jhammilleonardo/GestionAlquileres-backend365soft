import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import { MaintenanceRequest } from './entities/maintenance-request.entity';
import { MaintenanceMessage } from './entities/maintenance-message.entity';
import { MaintenanceAttachment } from './entities/maintenance-attachment.entity';
import { Contract } from '../contracts/entities/contract.entity';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { CreateMaintenanceDto } from './dto/create-maintenance.dto';
import { UpdateMaintenanceDto } from './dto/update-maintenance.dto';
import { CreateMessageDto } from './dto/create-message.dto';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class MaintenanceService {
  constructor(
    @InjectRepository(MaintenanceRequest)
    private maintenanceRepository: Repository<MaintenanceRequest>,
    @InjectRepository(MaintenanceMessage)
    private messageRepository: Repository<MaintenanceMessage>,
    @InjectRepository(MaintenanceAttachment)
    private attachmentRepository: Repository<MaintenanceAttachment>,
    @InjectRepository(Contract)
    private contractRepository: Repository<Contract>,
    private dataSource: DataSource,
    private notificationsService: NotificationsService,
  ) {}

  /**
   * Genera un número de ticket único y aleatorio
   * Formato: MNT-AAAA-XXXXXX
   */
  private generateTicketNumber(): string {
    const year = new Date().getFullYear();
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin caracteres confusos (0, O, I, 1)
    let random = '';
    for (let i = 0; i < 6; i++) {
      random += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `MNT-${year}-${random}`;
  }

  /**
   * Crea una nueva solicitud de mantenimiento
   */
  async create(
    createMaintenanceDto: CreateMaintenanceDto,
    tenantId: number,
    contractId: number | undefined,
    assignedTo: number,
  ): Promise<MaintenanceRequest> {
    let contract: any = null;

    // Si no se proporciona contract_id, buscar automáticamente el contrato activo del tenant
    if (!contractId) {
      const activeContracts = await this.dataSource.query(
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

      contract = activeContracts[0];
      console.log(
        `✅ [Maintenance] Contrato activo encontrado automáticamente: ${contract.contract_number}`,
      );
    } else {
      // Si se proporciona contract_id (caso admin), validar que exista
      const contracts = await this.dataSource.query(
        `SELECT c.*, p.id as property_id, p.title as property_title
         FROM contracts c
         LEFT JOIN properties p ON c.property_id = p.id
         WHERE c.id = $1`,
        [contractId],
      );

      if (!contracts || contracts.length === 0) {
        throw new NotFoundException('Contrato no encontrado');
      }

      contract = contracts[0];

      // Validar que el contrato esté activo
      const activeStatuses = [ContractStatus.ACTIVO, ContractStatus.POR_VENCER];
      if (!activeStatuses.includes(contract.status)) {
        throw new BadRequestException(
          `Solo se pueden crear solicitudes de mantenimiento para contratos activos. Estado actual: ${contract.status}`,
        );
      }

      // Validar que el tenant del contrato coincida con el usuario autenticado
      if (contract.tenant_id !== tenantId) {
        throw new ForbiddenException(
          'No tienes permiso para crear solicitudes de mantenimiento para este contrato',
        );
      }
    }

    const ticketNumber = this.generateTicketNumber();
    const propertyId = contract.property_id; // Ya viene del JOIN
    const finalContractId = contract.id;

    // Validar: si es GENERAL, category debe ser null
    let category: string | undefined = createMaintenanceDto.category;
    if (createMaintenanceDto.request_type === 'GENERAL') {
      category = undefined;
    }

    // Usar query directa que respeta el search_path del tenant
    const result = await this.dataSource.query(
      `INSERT INTO maintenance_requests(
        ticket_number, request_type, category, title, description,
        permission_to_enter, has_pets, entry_notes,
        tenant_id, property_id, contract_id, assigned_to
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      RETURNING *`,
      [
        ticketNumber,
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
    );

    const savedRequest = result[0];

    // Guardar archivos adjuntos si existen
    if (createMaintenanceDto.files && createMaintenanceDto.files.length > 0) {
      for (const fileUrl of createMaintenanceDto.files) {
        await this.dataSource.query(
          `INSERT INTO maintenance_attachments(
            maintenance_request_id, file_url, file_name, file_type, file_size, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            savedRequest.id,
            fileUrl,
            fileUrl.split('/').pop() || 'unknown',
            this.getFileType(fileUrl),
            0,
            tenantId,
          ],
        );
      }
    }

    // Crear notificación para los admins sobre la nueva solicitud
    try {
      console.log(
        '🔔 [Maintenance] Intentando crear notificación, assignedTo:',
        assignedTo,
      );

      // Si no hay admin asignado, buscar admins del tenant
      if (!assignedTo) {
        console.log(
          '⚠️ [Maintenance] No hay admin asignado, buscando admins del tenant...',
        );

        const admins = await this.dataSource.query(
          `SELECT id FROM "user" WHERE role = 'ADMIN'`,
        );

        console.log('👥 [Maintenance] Admins encontrados:', admins.length);

        if (admins.length > 0) {
          assignedTo = admins[0].id; // Usar el primer admin
          console.log(
            '✅ [Maintenance] Admin asignado automáticamente:',
            assignedTo,
          );
        } else {
          console.log(
            '❌ [Maintenance] No hay admins en el tenant, no se puede notificar',
          );
        }
      }

      if (assignedTo) {
        // Obtener información de la propiedad para el metadata
        const propertyInfo = await this.dataSource.query(
          `SELECT id, title FROM properties WHERE id = $1`,
          [propertyId],
        );
        const property = propertyInfo[0];

        // Obtener información del inquilino
        const tenantInfo = await this.dataSource.query(
          `SELECT name FROM "user" WHERE id = $1`,
          [tenantId],
        );
        const tenantName = tenantInfo[0]?.name || 'Inquilino';

        console.log(
          '📧 [Maintenance] Creando notificación para user_id:',
          assignedTo,
        );

        await this.notificationsService.createForUser(
          assignedTo,
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

        console.log('✅ [Maintenance] Notificación creada exitosamente');
      }
    } catch (error) {
      // No fallar si la notificación no se puede crear
      console.error(
        '❌ [Maintenance] Error al crear notificación:',
        error.message,
      );
      console.error('❌ [Maintenance] Error stack:', error.stack);
    }

    return this.findOne(savedRequest.id);
  }

  /**
   * Obtiene todas las solicitudes (admin) con filtros
   */
  async findAll(filters?: {
    status?: string;
    priority?: string;
    request_type?: string;
    tenant_id?: number;
    property_id?: number;
    contract_id?: number;
  }): Promise<any[]> {
    let query = `
      SELECT
        mr.*,
        json_build_object('id', p.id, 'title', p.title) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN contracts c ON c.id = mr.contract_id
      WHERE 1=1
    `;
    const params: any[] = [];
    let paramIndex = 1;

    if (filters?.status) {
      query += ` AND mr.status = $${paramIndex++}`;
      params.push(filters.status);
    }

    if (filters?.priority) {
      query += ` AND mr.priority = $${paramIndex++}`;
      params.push(filters.priority);
    }

    if (filters?.request_type) {
      query += ` AND mr.request_type = $${paramIndex++}`;
      params.push(filters.request_type);
    }

    if (filters?.tenant_id) {
      query += ` AND mr.tenant_id = $${paramIndex++}`;
      params.push(filters.tenant_id);
    }

    if (filters?.property_id) {
      query += ` AND mr.property_id = $${paramIndex++}`;
      params.push(filters.property_id);
    }

    if (filters?.contract_id) {
      query += ` AND mr.contract_id = $${paramIndex++}`;
      params.push(filters.contract_id);
    }

    query += ` ORDER BY mr.updated_at DESC`;

    return this.dataSource.query(query, params);
  }

  /**
   * Obtiene las solicitudes de un inquilino específico
   */
  async findByTenant(tenantId: number): Promise<any[]> {
    return this.dataSource.query(
      `SELECT
        mr.*,
        json_build_object('id', p.id, 'title', p.title) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN contracts c ON c.id = mr.contract_id
      WHERE mr.tenant_id = $1
      ORDER BY mr.updated_at DESC`,
      [tenantId],
    );
  }

  /**
   * Obtiene una solicitud por ID con todos sus detalles
   */
  async findOne(id: number): Promise<any> {
    const requests = await this.dataSource.query(
      `SELECT
        mr.*,
        json_build_object('id', p.id, 'title', p.title) as property,
        json_build_object('id', c.id, 'contract_number', c.contract_number) as contract
      FROM maintenance_requests mr
      LEFT JOIN properties p ON p.id = mr.property_id
      LEFT JOIN contracts c ON c.id = mr.contract_id
      WHERE mr.id = $1`,
      [id],
    );

    if (!requests || requests.length === 0) {
      throw new NotFoundException('Solicitud no encontrada');
    }

    const maintenance = requests[0];

    // Obtener mensajes con sus attachments
    const messages = await this.dataSource.query(
      `SELECT
        mm.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'file_url', ma.file_url,
              'file_name', ma.file_name,
              'file_type', ma.file_type,
              'created_at', ma.created_at
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM maintenance_messages mm
      LEFT JOIN maintenance_attachments ma ON ma.message_id = mm.id
      WHERE mm.maintenance_request_id = $1
      GROUP BY mm.id
      ORDER BY mm.created_at ASC`,
      [id],
    );

    maintenance.messages = messages;

    // Obtener attachments directos de la solicitud
    const attachments = await this.dataSource.query(
      `SELECT * FROM maintenance_attachments
      WHERE maintenance_request_id = $1 AND message_id IS NULL`,
      [id],
    );

    maintenance.attachments = attachments;

    return maintenance;
  }

  /**
   * Actualiza una solicitud
   */
  async update(
    id: number,
    updateMaintenanceDto: UpdateMaintenanceDto,
  ): Promise<any> {
    // Obtener el estado actual antes de actualizar
    const currentRequest = await this.findOne(id);
    const oldStatus = currentRequest.status;
    const oldAssignedTo = currentRequest.assigned_to;

    const updates: string[] = [];
    const params: any[] = [];
    let paramIndex = 1;

    Object.entries(updateMaintenanceDto).forEach(([key, value]) => {
      if (value !== undefined) {
        // Convert camelCase to snake_case
        const columnName = key.replace(/([A-Z])/g, '_$1').toLowerCase();
        updates.push(`${columnName} = $${paramIndex++}`);
        params.push(value);
      }
    });

    if (updates.length === 0) {
      return this.findOne(id);
    }

    params.push(id);

    await this.dataSource.query(
      `UPDATE maintenance_requests
      SET ${updates.join(', ')}
      WHERE id = $${paramIndex}`,
      params,
    );

    // Crear notificaciones según los cambios
    try {
      // Notificar cambio de estado al inquilino
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

      // Notificar asignación al admin
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

      // Notificar completado al inquilino
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
    } catch (error) {
      // No fallar si la notificación no se puede crear
      console.error('Error al crear notificación:', error.message);
    }

    return this.findOne(id);
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
  ): Promise<any> {
    const request = await this.findOne(requestId);

    // Verificar si el inquilino puede enviar mensajes
    const isTenant = request.tenant_id === userId;
    if (isTenant && ['COMPLETED', 'CLOSED'].includes(request.status)) {
      throw new ForbiddenException(
        'No puedes enviar mensajes en solicitudes terminadas o cerradas',
      );
    }

    // Insertar mensaje
    const messageResult = await this.dataSource.query(
      `INSERT INTO maintenance_messages (maintenance_request_id, user_id, message, send_to_resident)
      VALUES ($1, $2, $3, $4)
      RETURNING *`,
      [
        requestId,
        userId,
        createMessageDto.message,
        createMessageDto.send_to_resident !== false,
      ],
    );

    const savedMessage = messageResult[0];

    // Guardar archivos adjuntos si existen
    if (createMessageDto.files && createMessageDto.files.length > 0) {
      for (const fileUrl of createMessageDto.files) {
        await this.dataSource.query(
          `INSERT INTO maintenance_attachments(
            message_id, file_url, file_name, file_type, file_size, uploaded_by
          ) VALUES ($1, $2, $3, $4, $5, $6)`,
          [
            savedMessage.id,
            fileUrl,
            fileUrl.split('/').pop() || 'unknown',
            this.getFileType(fileUrl),
            0,
            userId,
          ],
        );
      }
    }

    // Crear notificación del mensaje recibido
    try {
      const isFromTenant = request.tenant_id === userId;
      const senderName = await this.getUserName(userId);
      const messagePreview =
        createMessageDto.message.length > 100
          ? createMessageDto.message.substring(0, 100) + '...'
          : createMessageDto.message;

      if (isFromTenant) {
        // El mensaje viene del inquilino -> notificar al admin asignado
        await this.notificationsService.createForUser(
          request.assigned_to,
          NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED,
          'Nuevo mensaje en solicitud',
          `${senderName} respondió a la solicitud ${request.ticket_number}: ${messagePreview}`,
          {
            ticket_number: request.ticket_number,
            maintenance_request_id: requestId,
            sender_name: senderName,
            sender_id: userId,
            message_preview: messagePreview,
            is_from_admin: false,
          },
        );
      } else {
        // El mensaje viene del admin -> notificar al inquilino
        await this.notificationsService.createForUser(
          request.tenant_id,
          NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED,
          'Nuevo mensaje en solicitud',
          `${senderName} respondió a tu solicitud ${request.ticket_number}: ${messagePreview}`,
          {
            ticket_number: request.ticket_number,
            maintenance_request_id: requestId,
            sender_name: senderName,
            sender_id: userId,
            message_preview: messagePreview,
            is_from_admin: true,
          },
        );
      }
    } catch (error) {
      // No fallar si la notificación no se puede crear
      console.error('Error al crear notificación:', error.message);
    }

    // Retornar mensaje con sus attachments
    const messages = await this.dataSource.query(
      `SELECT
        mm.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'file_url', ma.file_url,
              'file_name', ma.file_name,
              'file_type', ma.file_type,
              'created_at', ma.created_at
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM maintenance_messages mm
      LEFT JOIN maintenance_attachments ma ON ma.message_id = mm.id
      WHERE mm.id = $1
      GROUP BY mm.id`,
      [savedMessage.id],
    );

    if (!messages || messages.length === 0) {
      throw new NotFoundException('Mensaje no encontrado');
    }

    return messages[0];
  }

  /**
   * Obtiene los mensajes de una solicitud
   */
  async getMessages(requestId: number, userId?: number): Promise<any[]> {
    const messages = await this.dataSource.query(
      `SELECT
        mm.*,
        COALESCE(
          json_agg(
            json_build_object(
              'id', ma.id,
              'file_url', ma.file_url,
              'file_name', ma.file_name,
              'file_type', ma.file_type,
              'created_at', ma.created_at
            )
          ) FILTER (WHERE ma.id IS NOT NULL),
          '[]'
        ) as attachments
      FROM maintenance_messages mm
      LEFT JOIN maintenance_attachments ma ON ma.message_id = mm.id
      WHERE mm.maintenance_request_id = $1
      GROUP BY mm.id
      ORDER BY mm.created_at ASC`,
      [requestId],
    );

    // Si se proporciona userId y es un inquilino, filtrar mensajes no enviados al residente
    const request = await this.findOne(requestId);
    if (userId && request.tenant_id === userId) {
      return messages.filter((msg) => msg.send_to_resident);
    }

    return messages;
  }

  /**
   * Obtiene estadísticas para el dashboard del admin
   */
  async getAdminStats(): Promise<any> {
    // Usar QueryRunner para mantener la misma conexión con el search_path del tenant
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const totalResult = await queryRunner.query(
        `SELECT COUNT(*) as count FROM maintenance_requests`,
      );
      const byStatusResult = await queryRunner.query(
        `SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status`,
      );
      const byPriorityResult = await queryRunner.query(
        `SELECT priority, COUNT(*) as count FROM maintenance_requests GROUP BY priority`,
      );
      const newResult = await queryRunner.query(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE status = 'NEW'`,
      );
      const urgentResult = await queryRunner.query(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE priority = 'HIGH' AND status = 'IN_PROGRESS'`,
      );

      await queryRunner.commitTransaction();
      await queryRunner.release();

      const total = parseInt(totalResult[0].count);
      const newRequests = parseInt(newResult[0].count);
      const urgentRequests = parseInt(urgentResult[0].count);

      const byStatus = byStatusResult.reduce((acc, item) => {
        acc[item.status] = parseInt(item.count);
        return acc;
      }, {} as any);

      const byPriority = byPriorityResult.reduce((acc, item) => {
        acc[item.priority] = parseInt(item.count);
        return acc;
      }, {} as any);

      return {
        total,
        byStatus,
        byPriority,
        newRequests,
        urgentRequests,
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      await queryRunner.release();
      throw error;
    }
  }

  /**
   * Obtiene estadísticas para el dashboard del inquilino
   */
  async getTenantStats(tenantId: number): Promise<any> {
    const [totalResult, activeResult, completedResult] = await Promise.all([
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1 AND status = 'IN_PROGRESS'`,
        [tenantId],
      ),
      this.dataSource.query(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1 AND status = 'COMPLETED'`,
        [tenantId],
      ),
    ]);

    return {
      total: parseInt(totalResult[0].count),
      active: parseInt(activeResult[0].count),
      completed: parseInt(completedResult[0].count),
    };
  }

  /**
   * Helper para obtener el tipo de archivo
   */
  private getFileType(filename: string): string {
    const ext = filename.split('.').pop()?.toLowerCase() || '';
    const imageExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
    const pdfExts = ['pdf'];

    if (imageExts.includes(ext)) return 'image';
    if (pdfExts.includes(ext)) return 'pdf';
    return 'unknown';
  }

  /**
   * Helper para obtener el nombre de un usuario
   */
  private async getUserName(userId: number): Promise<string> {
    try {
      const result = await this.dataSource.query(
        `SELECT name FROM "user" WHERE id = $1`,
        [userId],
      );
      return result[0]?.name || 'Usuario';
    } catch {
      return 'Usuario';
    }
  }
}
