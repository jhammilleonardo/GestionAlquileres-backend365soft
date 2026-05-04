import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationEventType } from './dto/create-notification.dto';
import {
  NotificationsGateway,
  RealtimeNotificationEvent,
} from './notifications.gateway';
import { tenantConnectionStore } from '../common/tenant/tenant-connection.store';

export interface NotificationRow {
  id: number;
  user_id: number;
  event_type: string;
  title: string;
  message: string;
  metadata: Record<string, unknown>;
  is_read: boolean;
  read_at: Date | null;
  created_at: Date;
}

interface NotificationTemplateRow {
  id: number;
  event_type: string;
  title_template: string;
  message_template: string;
  variables: string[];
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

interface DefaultTemplate {
  event_type: NotificationEventType;
  title_template: string;
  message_template: string;
  variables: string[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  private readonly realtimeEventMap: Partial<
    Record<NotificationEventType, RealtimeNotificationEvent>
  > = {
    [NotificationEventType.PAYMENT_CREATED]: 'payment.received',
    [NotificationEventType.PAYMENT_APPROVED]: 'payment.approved',
    [NotificationEventType.MAINTENANCE_REQUEST_CREATED]: 'maintenance.new',
    [NotificationEventType.MAINTENANCE_STATUS_CHANGED]: 'maintenance.updated',
    [NotificationEventType.MAINTENANCE_ASSIGNED]: 'maintenance.updated',
    [NotificationEventType.MAINTENANCE_COMPLETED]: 'maintenance.updated',
    [NotificationEventType.CONTRACT_SIGNED]: 'contract.signed',
    [NotificationEventType.APPLICATION_STATUS_CHANGED]: 'screening.completed',
    [NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED]: 'message.new',
  };

  constructor(
    @InjectDataSource() private dataSource: DataSource,
    private readonly notificationsGateway: NotificationsGateway,
  ) {}

  async createForUser(
    userId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
    tenantSlug?: string,
  ): Promise<NotificationRow> {
    const result = await this.dataSource.query<NotificationRow[]>(
      `INSERT INTO notifications (user_id, event_type, title, message, metadata, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, false, NOW())
       RETURNING *`,
      [userId, eventType as string, title, message, JSON.stringify(metadata ?? {})],
    );
    const created = result[0];

    await this.emitUserNotification(eventType, created, tenantSlug);

    return created;
  }

  async notifyAdmins(
    adminIds: number[],
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata?: Record<string, unknown>,
    tenantSlug?: string,
  ): Promise<NotificationRow[]> {
    if (adminIds.length === 0) {
      return [];
    }

    const values: unknown[] = [];
    const placeholders = adminIds.map((adminId, i) => {
      const base = i * 5;
      values.push(adminId, eventType as string, title, message, JSON.stringify(metadata ?? {}));
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, false, NOW())`;
    });

    const rows = await this.dataSource.query<NotificationRow[]>(
      `INSERT INTO notifications (user_id, event_type, title, message, metadata, is_read, created_at)
       VALUES ${placeholders.join(', ')}
       RETURNING *`,
      values,
    );

    const realtimeEvent = this.realtimeEventMap[eventType];
    if (realtimeEvent) {
      const resolvedSlug = await this.resolveTenantSlug(tenantSlug);
      if (resolvedSlug) {
        for (const row of rows) {
          this.notificationsGateway.emitUserEvent(resolvedSlug, row.user_id, realtimeEvent, {
            user_id: row.user_id,
            title,
            message,
            metadata: metadata ?? {},
            notification: row as unknown as Record<string, unknown>,
          });
        }
      } else {
        this.logger.warn(
          `notifyAdmins: no se pudo resolver tenantSlug para evento ${eventType} — evento WS no emitido`,
        );
      }
    }

    return rows;
  }

  async findAll(
    userId: number,
    filters?: { is_read?: boolean; event_type?: string; limit?: number; offset?: number },
  ): Promise<NotificationRow[]> {
    const { is_read, event_type, limit = 20, offset = 0 } = filters ?? {};

    let query = `SELECT * FROM notifications WHERE user_id = $1`;
    const params: unknown[] = [userId];
    let paramIndex = 2;

    if (is_read !== undefined) {
      query += ` AND is_read = $${paramIndex++}`;
      params.push(is_read);
    }

    if (event_type) {
      query += ` AND event_type = $${paramIndex++}`;
      params.push(event_type);
    }

    query += ` ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex}`;
    params.push(limit, offset);

    return this.dataSource.query<NotificationRow[]>(query, params);
  }

  async findOne(id: number, userId: number): Promise<NotificationRow> {
    const results = await this.dataSource.query<NotificationRow[]>(
      `SELECT * FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );

    if (!results || results.length === 0) {
      throw new NotFoundException('Notificación no encontrada');
    }

    return results[0];
  }

  async markAsRead(id: number, userId: number): Promise<NotificationRow> {
    const notification = await this.findOne(id, userId);

    if (!notification.is_read) {
      await this.dataSource.query(
        `UPDATE notifications SET is_read = true, read_at = NOW() WHERE id = $1 AND user_id = $2`,
        [id, userId],
      );
      notification.is_read = true;
      notification.read_at = new Date();
    }

    return notification;
  }

  async markAllAsRead(userId: number): Promise<{ updated_count: number }> {
    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) as count FROM notifications WHERE user_id = $1 AND is_read = false`,
      [userId],
    );

    const unreadCount = parseInt(countResult[0].count);
    if (unreadCount === 0) {
      return { updated_count: 0 };
    }

    await this.dataSource.query(
      `UPDATE notifications SET is_read = true, read_at = NOW() WHERE user_id = $1 AND is_read = false`,
      [userId],
    );

    return { updated_count: unreadCount };
  }

  async remove(id: number, userId: number): Promise<void> {
    await this.findOne(id, userId);
    await this.dataSource.query(
      `DELETE FROM notifications WHERE id = $1 AND user_id = $2`,
      [id, userId],
    );
  }

  async getStats(userId: number): Promise<{
    total: number;
    unread: number;
    by_type: Record<string, number>;
  }> {
    const result = await this.dataSource.query<
      Array<{ total: string; unread: string; by_type: Record<string, unknown> | null }>
    >(
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

    const row = result[0] ?? { total: '0', unread: '0', by_type: null };
    const by_type: Record<string, number> = {};
    if (row.by_type) {
      Object.entries(row.by_type).forEach(([k, v]) => {
        by_type[k] = parseInt(String(v));
      });
    }

    return {
      total: parseInt(row.total),
      unread: parseInt(row.unread),
      by_type,
    };
  }

  async getTemplate(eventType: NotificationEventType): Promise<NotificationTemplateRow | null> {
    const results = await this.dataSource.query<NotificationTemplateRow[]>(
      `SELECT * FROM notification_templates WHERE event_type = $1 AND is_active = true`,
      [eventType],
    );

    return results.length > 0 ? results[0] : null;
  }

  renderMessage(template: string, variables: Record<string, unknown>): string {
    let message = template;
    Object.keys(variables).forEach((key) => {
      const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
      message = message.replace(regex, String(variables[key]));
    });
    return message;
  }

  async createFromTemplate(
    userId: number,
    eventType: NotificationEventType,
    variables: Record<string, unknown>,
  ): Promise<NotificationRow | null> {
    const template = await this.getTemplate(eventType);
    if (!template) {
      return null;
    }

    const title = this.renderMessage(template.title_template, variables);
    const message = this.renderMessage(template.message_template, variables);

    return this.createForUser(userId, eventType, title, message, variables);
  }

  async initializeDefaultTemplates(): Promise<void> {
    const defaultTemplates: DefaultTemplate[] = [
      {
        event_type: NotificationEventType.MAINTENANCE_REQUEST_CREATED,
        title_template: 'Nueva solicitud de mantenimiento',
        message_template:
          '{{tenant_name}} ha creado una nueva solicitud de mantenimiento: {{title}}',
        variables: ['tenant_name', 'title', 'ticket_number', 'property_title'],
      },
      {
        event_type: NotificationEventType.MAINTENANCE_STATUS_CHANGED,
        title_template: 'Estado de solicitud actualizado',
        message_template:
          'La solicitud {{ticket_number}} ha cambiado de estado de {{old_status}} a {{new_status}}',
        variables: ['ticket_number', 'old_status', 'new_status', 'property_title'],
      },
      {
        event_type: NotificationEventType.MAINTENANCE_MESSAGE_RECEIVED,
        title_template: 'Nuevo mensaje en solicitud',
        message_template:
          '{{sender_name}} respondió a la solicitud {{ticket_number}}: {{message_preview}}',
        variables: ['ticket_number', 'sender_name', 'message_preview'],
      },
      {
        event_type: NotificationEventType.MAINTENANCE_ASSIGNED,
        title_template: 'Solicitud asignada',
        message_template: 'Se te ha asignado la solicitud {{ticket_number}}: {{title}}',
        variables: ['ticket_number', 'title', 'property_title', 'priority'],
      },
      {
        event_type: NotificationEventType.MAINTENANCE_COMPLETED,
        title_template: 'Solicitud completada',
        message_template: 'La solicitud {{ticket_number}} ha sido marcada como completada',
        variables: ['ticket_number', 'property_title'],
      },
      {
        event_type: NotificationEventType.PROPERTY_STATUS_CHANGED,
        title_template: 'Estado de propiedad actualizado',
        message_template:
          'La propiedad {{property_title}} ha cambiado de {{old_status}} a {{new_status}}',
        variables: ['property_title', 'old_status', 'new_status'],
      },
      {
        event_type: NotificationEventType.PROPERTY_AVAILABLE,
        title_template: 'Propiedad disponible',
        message_template: 'La propiedad {{property_title}} ahora está disponible',
        variables: ['property_title'],
      },
      {
        event_type: NotificationEventType.USER_REGISTERED,
        title_template: 'Nuevo usuario registrado',
        message_template: '{{user_name}} se ha registrado en el sistema',
        variables: ['user_name', 'user_email', 'role'],
      },
      {
        event_type: NotificationEventType.USER_PASSWORD_CHANGED,
        title_template: 'Contraseña actualizada',
        message_template: 'Tu contraseña ha sido actualizada exitosamente',
        variables: [],
      },
      {
        event_type: NotificationEventType.PAYMENT_CREATED,
        title_template: 'Nuevo pago registrado',
        message_template:
          '{{tenant_name}} ha registrado un pago de {{amount}} {{currency}} para la propiedad {{property_title}}',
        variables: ['tenant_name', 'amount', 'currency', 'property_title', 'payment_id'],
      },
      {
        event_type: NotificationEventType.PAYMENT_APPROVED,
        title_template: 'Pago aprobado',
        message_template: 'Tu pago de {{amount}} {{currency}} ha sido aprobado',
        variables: ['amount', 'currency', 'payment_id', 'property_title'],
      },
      {
        event_type: NotificationEventType.PAYMENT_REJECTED,
        title_template: 'Pago rechazado',
        message_template:
          'Tu pago de {{amount}} {{currency}} ha sido rechazado. Motivo: {{rejection_reason}}',
        variables: ['amount', 'currency', 'payment_id', 'rejection_reason'],
      },
      {
        event_type: NotificationEventType.CONTRACT_CREATED,
        title_template: 'Nuevo contrato disponible',
        message_template:
          'Se ha creado el contrato {{contract_number}} para la propiedad {{property_title}}. Por favor revísalo y fírmalo.',
        variables: ['contract_number', 'property_title', 'contract_id'],
      },
      {
        event_type: NotificationEventType.CONTRACT_SIGNED,
        title_template: 'Contrato firmado',
        message_template:
          '{{tenant_name}} ha firmado el contrato {{contract_number}} para la propiedad {{property_title}}',
        variables: ['tenant_name', 'contract_number', 'property_title', 'contract_id'],
      },
      {
        event_type: NotificationEventType.CONTRACT_EXPIRING,
        title_template: 'Contrato próximo a vencer',
        message_template:
          'El contrato {{contract_number}} para la propiedad {{property_title}} vence el {{end_date}}',
        variables: ['contract_number', 'property_title', 'end_date', 'contract_id'],
      },
    ];

    const existingRows = await this.dataSource.query<{ event_type: string }[]>(
      `SELECT event_type FROM notification_templates`,
    );
    const existing = new Set(existingRows.map((r) => r.event_type));

    const missing = defaultTemplates.filter((t) => !existing.has(t.event_type as string));
    if (missing.length === 0) {
      return;
    }

    const values: unknown[] = [];
    const placeholders = missing.map((t, i) => {
      const base = i * 4;
      values.push(t.event_type, t.title_template, t.message_template, t.variables);
      return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}::text[], true, NOW(), NOW())`;
    });

    await this.dataSource.query(
      `INSERT INTO notification_templates (event_type, title_template, message_template, variables, is_active, created_at, updated_at)
       VALUES ${placeholders.join(', ')}`,
      values,
    );
  }

  private async emitUserNotification(
    eventType: NotificationEventType,
    row: NotificationRow,
    tenantSlug?: string,
  ): Promise<void> {
    const realtimeEvent = this.realtimeEventMap[eventType];
    if (!realtimeEvent) {
      return;
    }

    const resolvedSlug = await this.resolveTenantSlug(tenantSlug);
    if (!resolvedSlug) {
      this.logger.warn(
        `emitUserNotification: no se pudo resolver tenantSlug para evento ${eventType} — evento WS no emitido`,
      );
      return;
    }

    this.notificationsGateway.emitUserEvent(resolvedSlug, row.user_id, realtimeEvent, {
      user_id: row.user_id,
      title: row.title,
      message: row.message,
      metadata: row.metadata,
      notification: row as unknown as Record<string, unknown>,
    });
  }

  private async resolveTenantSlug(tenantSlug?: string): Promise<string | null> {
    if (tenantSlug) {
      return tenantSlug;
    }

    const schemaName = tenantConnectionStore.getStore()?.schemaName;
    if (!schemaName) {
      return null;
    }

    try {
      const rows = await this.dataSource.query<{ slug: string }[]>(
        `SELECT slug FROM public.tenant WHERE schema_name = $1 LIMIT 1`,
        [schemaName],
      );

      return rows.length > 0 ? rows[0].slug : null;
    } catch (error) {
      this.logger.error(
        `Error al resolver tenantSlug desde schema "${schemaName}"`,
        error instanceof Error ? error.stack : undefined,
      );
      return null;
    }
  }
}
