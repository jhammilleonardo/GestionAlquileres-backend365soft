import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEventType } from './dto/create-notification.dto';

@Injectable()
export class NotificationsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  /**
   * Crear una notificación para un usuario específico
   */
  async createForUser(
    userId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.dataSource.query(
      `INSERT INTO notifications (
        user_id, event_type, title, message, metadata, is_read, created_at
      ) VALUES ($1, $2, $3, $4, $5, false, NOW())
      RETURNING *`,
      [
        userId,
        eventType as string,
        title,
        message,
        JSON.stringify(metadata || {}),
      ],
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return result[0];
  }

  /**
   * Crear notificaciones para múltiples usuarios (admins)
   */
  async notifyAdmins(
    adminIds: number[],
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata?: Record<string, any>,
  ): Promise<any[]> {
    const notifications: any[] = [];

    for (const adminId of adminIds) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const result = await this.dataSource.query(
        `INSERT INTO notifications (
          user_id, event_type, title, message, metadata, is_read, created_at
        ) VALUES ($1, $2, $3, $4, $5, false, NOW())
        RETURNING *`,
        [
          adminId,
          eventType as string,
          title,
          message,
          JSON.stringify(metadata || {}),
        ],
      );
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      notifications.push(result[0]);
    }

    return notifications;
  }

  /**
   * Obtener todas las notificaciones del usuario autenticado
   */
  async findAll(
    userId: number,
    filters?: {
      is_read?: boolean;
      event_type?: string;
      limit?: number;
      offset?: number;
    },
  ): Promise<any[]> {
    const { is_read, event_type, limit = 20, offset = 0 } = filters || {};

    let query = `
      SELECT * FROM notifications
      WHERE user_id = $1
    `;
    const params: any[] = [userId];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex++}`;
      params.push(is_read);
    }

    if (event_type) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(event_type);
    }

    query += ` ORDER BY created_at DESC`;
    query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
    params.push(limit, offset);

    return await this.dataSource.query(query, params);
  }

  /**
   * Obtener una notificación por ID (del usuario autenticado)
   */
  async findOne(id: number, userId: number): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const results = await this.dataSource.query(
      `SELECT * FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!results || results.length === 0) {
      throw new NotFoundException('Notificación no encontrada');
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    return results[0];
  }

  /**
   * Marcar una notificación como leída
   */
  async markAsRead(id: number, userId: number): Promise<any> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const notification = await this.findOne(id, userId);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (!notification.is_read) {
      await this.dataSource.query(
        `UPDATE notifications
         SET is_read = true, read_at = NOW()
         WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      notification.is_read = true;
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      notification.read_at = new Date();
    }

    return notification;
  }

  /**
   * Marcar todas las notificaciones del usuario como leídas
   */
  async markAllAsRead(userId: number): Promise<{ updated_count: number }> {
    // Primero contar cuántas notificaciones sin leer hay
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const countResult = await this.dataSource.query(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
    const unreadCount = parseInt(countResult[0].count);

    // Si no hay notificaciones sin leer, retornar 0
    if (unreadCount === 0) {
      return { updated_count: 0 };
    }

    // Marcar todas como leídas
    await this.dataSource.query(
      `UPDATE notifications
       SET is_read = true, read_at = NOW()
       WHERE user_id = $1 AND is_read = false`,
      [userId],
    );

    return { updated_count: unreadCount };
  }

  /**
   * Eliminar una notificación
   */
  async remove(id: number, userId: number): Promise<void> {
    await this.findOne(id, userId);
    await this.dataSource.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }

  /**
   * Obtener estadísticas de notificaciones del usuario
   */
  async getStats(userId: number): Promise<{
    total: number;
    unread: number;
    by_type: Record<string, number>;
  }> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const result = await this.dataSource.query(
      `SELECT
        COUNT(*) as total,
        COUNT(*) FILTER (WHERE is_read = false) as unread,
        (SELECT json_object_agg(event_type, cnt)
         FROM (SELECT event_type, COUNT(*) as cnt FROM notifications n2
               WHERE n2.user_id = $1 GROUP BY event_type) t
        ) as by_type
       FROM notifications
       WHERE user_id = $1`,
      [userId],
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const row = result[0];
    const by_type: Record<string, number> = {};
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    if (row.by_type) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      Object.entries(row.by_type as Record<string, unknown>).forEach(([k, v]) => {
        by_type[k] = parseInt(String(v));
      });
    }

    return {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      total: parseInt(row.total),
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      unread: parseInt(row.unread),
      by_type,
    };
  }

  /**
   * Obtener plantilla de notificación por tipo de evento
   */
  async getTemplate(
    eventType: NotificationEventType,
  ): Promise<Record<string, any> | null> {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const results = await this.dataSource.query(
      `SELECT * FROM notification_templates
       WHERE event_type = $1 AND is_active = true`,
      [eventType],
    );

    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return
    return results.length > 0 ? results[0] : null;
  }

  /**
   * Renderizar mensaje usando plantilla
   */
  renderMessage(template: string, variables: Record<string, any>): string {
    let message = template;

    // Reemplazar variables en formato {{variable_name}}
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      message = message.replace(regex, String(variables[key]));
    });

    return message;
  }

  /**
   * Crear notificación usando plantilla
   */
  async createFromTemplate(
    userId: number,
    eventType: NotificationEventType,
    variables: Record<string, any>,
  ): Promise<Record<string, any> | null> {
    const template = await this.getTemplate(eventType);

    if (!template) {
      // Si no hay plantilla, no crear notificación
      return null;
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const title = this.renderMessage(template.title_template, variables);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
    const message = this.renderMessage(template.message_template, variables);

    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return await this.createForUser(
      userId,
      eventType,
      title,
      message,
      variables,
    );
  }

  /**
   * Inicializar plantillas por defecto para un tenant
   */
  async initializeDefaultTemplates(): Promise<void> {
    const defaultTemplates = [
      // Mantenimiento
      {
        event_type: 'maintenance.request.created' as NotificationEventType,
        title_template: 'Nueva solicitud de mantenimiento',
        message_template:
          '{{tenant_name}} ha creado una nueva solicitud de mantenimiento: {{title}}',
        variables: ['tenant_name', 'title', 'ticket_number', 'property_title'],
      },
      {
        event_type: 'maintenance.status.changed' as NotificationEventType,
        title_template: 'Estado de solicitud actualizado',
        message_template:
          'La solicitud {{ticket_number}} ha cambiado de estado de {{old_status}} a {{new_status}}',
        variables: [
          'ticket_number',
          'old_status',
          'new_status',
          'property_title',
        ],
      },
      {
        event_type: 'maintenance.message.received' as NotificationEventType,
        title_template: 'Nuevo mensaje en solicitud',
        message_template:
          '{{sender_name}} respondió a la solicitud {{ticket_number}}: {{message_preview}}',
        variables: ['ticket_number', 'sender_name', 'message_preview'],
      },
      {
        event_type: 'maintenance.assigned' as NotificationEventType,
        title_template: 'Solicitud asignada',
        message_template:
          'Se te ha asignado la solicitud {{ticket_number}}: {{title}}',
        variables: ['ticket_number', 'title', 'property_title', 'priority'],
      },
      {
        event_type: 'maintenance.completed' as NotificationEventType,
        title_template: 'Solicitud completada',
        message_template:
          'La solicitud {{ticket_number}} ha sido marcada como completada',
        variables: ['ticket_number', 'property_title'],
      },
      // Propiedades
      {
        event_type: 'property.status.changed' as NotificationEventType,
        title_template: 'Estado de propiedad actualizado',
        message_template:
          'La propiedad {{property_title}} ha cambiado de {{old_status}} a {{new_status}}',
        variables: ['property_title', 'old_status', 'new_status'],
      },
      {
        event_type: 'property.available' as NotificationEventType,
        title_template: 'Propiedad disponible',
        message_template:
          'La propiedad {{property_title}} ahora está disponible',
        variables: ['property_title'],
      },
      // Usuarios
      {
        event_type: 'user.registered' as NotificationEventType,
        title_template: 'Nuevo usuario registrado',
        message_template: '{{user_name}} se ha registrado en el sistema',
        variables: ['user_name', 'user_email', 'role'],
      },
      {
        event_type: 'user.password.changed' as NotificationEventType,
        title_template: 'Contraseña actualizada',
        message_template: 'Tu contraseña ha sido actualizada exitosamente',
        variables: [],
      },
      // Pagos
      {
        event_type: 'payment.created' as NotificationEventType,
        title_template: 'Nuevo pago registrado',
        message_template:
          '{{tenant_name}} ha registrado un pago de {{amount}} {{currency}} para la propiedad {{property_title}}',
        variables: ['tenant_name', 'amount', 'currency', 'property_title', 'payment_id'],
      },
      {
        event_type: 'payment.approved' as NotificationEventType,
        title_template: 'Pago aprobado',
        message_template:
          'Tu pago de {{amount}} {{currency}} ha sido aprobado',
        variables: ['amount', 'currency', 'payment_id', 'property_title'],
      },
      {
        event_type: 'payment.rejected' as NotificationEventType,
        title_template: 'Pago rechazado',
        message_template:
          'Tu pago de {{amount}} {{currency}} ha sido rechazado. Motivo: {{rejection_reason}}',
        variables: ['amount', 'currency', 'payment_id', 'rejection_reason'],
      },
      // Contratos
      {
        event_type: 'contract.created' as NotificationEventType,
        title_template: 'Nuevo contrato disponible',
        message_template:
          'Se ha creado el contrato {{contract_number}} para la propiedad {{property_title}}. Por favor revísalo y fírmalo.',
        variables: ['contract_number', 'property_title', 'contract_id'],
      },
      {
        event_type: 'contract.signed' as NotificationEventType,
        title_template: 'Contrato firmado',
        message_template:
          '{{tenant_name}} ha firmado el contrato {{contract_number}} para la propiedad {{property_title}}',
        variables: ['tenant_name', 'contract_number', 'property_title', 'contract_id'],
      },
      {
        event_type: 'contract.expiring' as NotificationEventType,
        title_template: 'Contrato próximo a vencer',
        message_template:
          'El contrato {{contract_number}} para la propiedad {{property_title}} vence el {{end_date}}',
        variables: ['contract_number', 'property_title', 'end_date', 'contract_id'],
      },
    ];

    for (const templateData of defaultTemplates) {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
      const exists = await this.dataSource.query(
        `SELECT id FROM notification_templates WHERE event_type = $1`,
        [templateData.event_type],
      );

      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      if (!exists || exists.length === 0) {
        await this.dataSource.query(
          `INSERT INTO notification_templates (
            event_type, title_template, message_template, variables, is_active, created_at, updated_at
          ) VALUES ($1, $2, $3, $4, true, NOW(), NOW())
          RETURNING *`,
          [
            templateData.event_type,
            templateData.title_template,
            templateData.message_template,
            templateData.variables,
          ],
        );
      }
    }
  }
}
