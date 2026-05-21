import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import { quoteIdent } from '../common/utils/sql-identifier';
import {
  LifecycleExternalChannel,
  LifecycleExternalNotificationAdapter,
} from './lifecycle-external-notification.adapter';

interface NotificationChannels {
  internal: boolean;
  email: boolean;
  whatsapp: boolean;
}

interface TenantRecord {
  schema_name: string;
  slug: string;
}

interface UserContact {
  email: string | null;
  phone: string | null;
}

@Injectable()
export class LifecycleNotificationsService {
  private readonly logger = new Logger(LifecycleNotificationsService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly externalNotificationAdapter: LifecycleExternalNotificationAdapter,
  ) {}

  /**
   * Llamado cuando un contrato pasa a estado ACTIVO.
   * Si recibe schemaName, opera con tablas calificadas y no depende de
   * search_path.
   */
  async onContractActivated(
    contractId: number,
    schemaName?: string,
  ): Promise<void> {
    const schemaPrefix = schemaName ? `${quoteIdent(schemaName)}.` : '';
    const rows = await this.dataSource.query<
      {
        id: number;
        contract_number: string;
        tenant_id: number;
        start_date: string;
        end_date: string;
        property_title: string;
        tenant_slug: string;
      }[]
    >(
      `SELECT c.id, c.contract_number, c.tenant_id, c.start_date, c.end_date,
              p.title as property_title
       FROM ${schemaPrefix}contracts c
       JOIN ${schemaPrefix}properties p ON p.id = c.property_id
       WHERE c.id = $1`,
      [contractId],
    );

    if (rows.length === 0) return;
    const contract = rows[0];

    const channels = schemaName
      ? await this.getChannelsForSchema(schemaName)
      : await this.getChannels();
    const title = 'Tu contrato está activo';
    const message =
      `Tu contrato ${contract.contract_number} para ${contract.property_title} ` +
      `está activo desde ${contract.start_date}. ` +
      `Accede a tu portal para ver detalles, gestionar pagos y solicitar mantenimiento.`;
    const metadata = {
      contract_id: contractId,
      contract_number: contract.contract_number,
      property_title: contract.property_title,
      start_date: contract.start_date,
      end_date: contract.end_date,
    };

    if (schemaName) {
      await this.dispatchToSchema(
        schemaName,
        contract.tenant_id,
        NotificationEventType.CONTRACT_ACTIVATED,
        title,
        message,
        metadata,
        channels,
      );
      return;
    }

    await this.dispatch(
      contract.tenant_id,
      NotificationEventType.CONTRACT_ACTIVATED,
      title,
      message,
      metadata,
      channels,
    );
  }

  /**
   * Llamado cuando una inspección de salida (move_out) se completa.
   * Opera con search_path ya establecido por TenantContextMiddleware.
   */
  async onMoveOutCompleted(inspectionId: number): Promise<void> {
    const inspectionRows = await this.dataSource.query<
      {
        id: number;
        type: string;
        completed_date: string;
        notes: string | null;
        property_title: string;
        property_id: number;
      }[]
    >(
      `SELECT i.id, i.type, i.completed_date, i.notes,
              p.title as property_title, p.id as property_id
       FROM inspections i
       JOIN properties p ON p.id = i.property_id
       WHERE i.id = $1`,
      [inspectionId],
    );

    if (inspectionRows.length === 0 || inspectionRows[0].type !== 'move_out')
      return;
    const inspection = inspectionRows[0];

    const itemStats = await this.dataSource.query<
      { condition: string; count: string }[]
    >(
      `SELECT condition, COUNT(*) as count
       FROM inspection_items
       WHERE inspection_id = $1
       GROUP BY condition`,
      [inspectionId],
    );

    const conditionSummary = itemStats
      .map((s) => `${s.condition}: ${s.count}`)
      .join(', ');

    const ownerRows = await this.dataSource
      .query<{ user_id: number; owner_email: string; owner_name: string }[]>(
        `SELECT u.id as user_id, ro.primary_email as owner_email, ro.name as owner_name
         FROM property_owners po
         JOIN rental_owners ro ON ro.id = po.rental_owner_id
         LEFT JOIN "user" u ON u.email = ro.primary_email AND u.role = 'PROPIETARIO'
         WHERE po.property_id = $1
           AND ro.is_active = true`,
        [inspection.property_id],
      )
      .catch(() => []);

    if (ownerRows.length === 0) {
      this.logger.warn(
        `No se encontraron propietarios para propiedad ${inspection.property_id} ` +
          `en inspección ${inspectionId}`,
      );
      return;
    }

    const channels = await this.getChannels();
    const title = 'Resumen de inspección de salida';
    const message =
      `La inspección de salida para ${inspection.property_title} fue completada ` +
      `el ${inspection.completed_date}. ` +
      (conditionSummary ? `Condiciones: ${conditionSummary}. ` : '') +
      (inspection.notes ? `Notas: ${inspection.notes}` : '');

    for (const owner of ownerRows) {
      if (owner.user_id) {
        await this.dispatch(
          owner.user_id,
          NotificationEventType.INSPECTION_MOVE_OUT_COMPLETED,
          title,
          message.trim(),
          {
            inspection_id: inspectionId,
            property_title: inspection.property_title,
          },
          channels,
        );
      } else if (channels.email) {
        await this.sendExternal(
          'email',
          owner.owner_email,
          title,
          message.trim(),
          {
            inspection_id: inspectionId,
          },
        );
      }
    }
  }

  /**
   * Cron: verifica contratos que vencen en 60, 30 o 15 días para todos los tenants.
   */
  async checkExpiringContracts(): Promise<void> {
    const tenants = await this.getAllActiveTenants();
    for (const tenant of tenants) {
      try {
        await this.processExpiringContractsForTenant(tenant.schema_name);
      } catch (err) {
        this.logger.error(
          `Error procesando contratos vencientes para ${tenant.slug}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }

  /**
   * Cron: verifica solicitudes de mantenimiento sin respuesta por más de 48 horas.
   */
  async checkUnassignedMaintenance(): Promise<void> {
    const tenants = await this.getAllActiveTenants();
    for (const tenant of tenants) {
      try {
        await this.processUnassignedMaintenanceForTenant(tenant.schema_name);
      } catch (err) {
        this.logger.error(
          `Error procesando mantenimiento sin asignar para ${tenant.slug}: ` +
            (err instanceof Error ? err.message : String(err)),
        );
      }
    }
  }

  private async processExpiringContractsForTenant(
    schemaName: string,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    const channels = await this.getChannelsForSchema(schemaName);
    const adminIds = await this.getAdminIdsForSchema(schemaName);

    const contracts = await this.dataSource.query<
      {
        id: number;
        contract_number: string;
        tenant_id: number;
        end_date: string;
        days_left: string;
        property_title: string;
        tenant_name: string;
      }[]
    >(
      `SELECT c.id, c.contract_number, c.tenant_id, c.end_date,
              (c.end_date - CURRENT_DATE) AS days_left,
              p.title AS property_title,
              u.name AS tenant_name
       FROM ${q}.contracts c
       JOIN ${q}.properties p ON p.id = c.property_id
       JOIN ${q}."user" u ON u.id = c.tenant_id
       WHERE c.status = 'ACTIVO'
         AND c.end_date BETWEEN CURRENT_DATE AND CURRENT_DATE + INTERVAL '61 days'`,
    );

    for (const contract of contracts) {
      const daysLeft = parseInt(contract.days_left, 10);

      if (daysLeft >= 59 && daysLeft <= 61) {
        await this.sendExpiryNotification(
          schemaName,
          contract,
          daysLeft,
          60,
          adminIds,
          channels,
        );
      } else if (daysLeft >= 28 && daysLeft <= 31) {
        await this.sendExpiryNotification(
          schemaName,
          contract,
          daysLeft,
          30,
          adminIds,
          channels,
        );
      } else if (daysLeft >= 14 && daysLeft <= 16) {
        await this.sendExpiryNotification(
          schemaName,
          contract,
          daysLeft,
          15,
          adminIds,
          channels,
        );
      }
    }
  }

  private async sendExpiryNotification(
    schemaName: string,
    contract: {
      id: number;
      contract_number: string;
      tenant_id: number;
      end_date: string;
      property_title: string;
      tenant_name: string;
    },
    daysLeft: number,
    bucket: 60 | 30 | 15,
    adminIds: number[],
    channels: NotificationChannels,
  ): Promise<void> {
    const eventKeyMap: Record<60 | 30 | 15, string> = {
      60: 'expiring_60',
      30: 'expiring_30',
      15: 'expiring_15',
    };
    const eventTypeMap: Record<60 | 30 | 15, NotificationEventType> = {
      60: NotificationEventType.CONTRACT_EXPIRING_60,
      30: NotificationEventType.CONTRACT_EXPIRING_30,
      15: NotificationEventType.CONTRACT_EXPIRING_15,
    };

    const eventKey = eventKeyMap[bucket];
    if (
      await this.hasBeenSentInSchema(
        schemaName,
        'contract',
        contract.id,
        eventKey,
      )
    )
      return;

    const eventType = eventTypeMap[bucket];
    const metadata = {
      contract_id: contract.id,
      contract_number: contract.contract_number,
      days_left: daysLeft,
      end_date: contract.end_date,
    };

    // Notificación a admins (todos los buckets)
    for (const adminId of adminIds) {
      const adminTitle =
        bucket === 15
          ? `URGENTE: Contrato vence en ${daysLeft} días`
          : `Contrato próximo a vencer — ${daysLeft} días`;
      const adminMsg =
        `El contrato ${contract.contract_number} de ${contract.tenant_name} ` +
        `para ${contract.property_title} vence el ${contract.end_date} (en ${daysLeft} días). ` +
        (bucket === 15
          ? 'Se requiere acción inmediata.'
          : 'Planifica la renovación o desocupación.');
      await this.dispatchToSchema(
        schemaName,
        adminId,
        eventType,
        adminTitle,
        adminMsg,
        metadata,
        channels,
      );
    }

    // Notificación al inquilino (solo buckets 60 y 30, no el urgente de 15)
    if (bucket !== 15) {
      const tenantTitle = `Tu contrato vence en ${daysLeft} días`;
      const tenantMsg =
        `Tu contrato ${contract.contract_number} para ${contract.property_title} vence el ${contract.end_date}. ` +
        (bucket === 30
          ? 'Opciones: (1) Solicitar renovación, (2) Iniciar proceso de desocupación. Contacta a tu administrador.'
          : 'Contacta a tu administrador para planificar la renovación.');
      await this.dispatchToSchema(
        schemaName,
        contract.tenant_id,
        eventType,
        tenantTitle,
        tenantMsg,
        metadata,
        channels,
      );
    }

    await this.markSentInSchema(schemaName, 'contract', contract.id, eventKey);
  }

  private async processUnassignedMaintenanceForTenant(
    schemaName: string,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    const channels = await this.getChannelsForSchema(schemaName);
    const adminIds = await this.getAdminIdsForSchema(schemaName);

    if (adminIds.length === 0) return;

    const requests = await this.dataSource.query<
      {
        id: number;
        ticket_number: string;
        title: string;
        property_title: string;
      }[]
    >(
      `SELECT mr.id, mr.ticket_number, mr.title, p.title AS property_title
       FROM ${q}.maintenance_requests mr
       JOIN ${q}.properties p ON p.id = mr.property_id
       WHERE mr.status = 'NEW'
         AND mr.assigned_to IS NULL
         AND mr.vendor_id IS NULL
         AND mr.created_at < NOW() - INTERVAL '48 hours'`,
    );

    for (const req of requests) {
      if (
        await this.hasBeenSentInSchema(
          schemaName,
          'maintenance_request',
          req.id,
          'unassigned_48h',
        )
      ) {
        continue;
      }

      const title = 'Solicitud de mantenimiento sin respuesta — 48 horas';
      const message =
        `La solicitud ${req.ticket_number} ("${req.title}") para ${req.property_title} ` +
        `lleva más de 48 horas sin asignación ni respuesta. Requiere atención inmediata.`;

      for (const adminId of adminIds) {
        await this.dispatchToSchema(
          schemaName,
          adminId,
          NotificationEventType.MAINTENANCE_UNASSIGNED_REMINDER,
          title,
          message,
          { request_id: req.id, ticket_number: req.ticket_number },
          channels,
        );
      }

      await this.markSentInSchema(
        schemaName,
        'maintenance_request',
        req.id,
        'unassigned_48h',
      );
    }
  }

  /** Dispatch HTTP-context: usa NotificationsService (search_path ya establecido). */
  private async dispatch(
    userId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
    channels: NotificationChannels,
  ): Promise<void> {
    if (channels.internal) {
      await this.notificationsService.createForUser(
        userId,
        eventType,
        title,
        message,
        metadata,
      );
    }
    if (channels.email) {
      const contact = await this.getUserContact(userId);
      await this.sendExternalIfContactExists(
        'email',
        contact.email,
        userId,
        title,
        message,
        metadata,
      );
    }
    if (channels.whatsapp) {
      const contact = await this.getUserContact(userId);
      await this.sendExternalIfContactExists(
        'whatsapp',
        contact.phone,
        userId,
        title,
        message,
        metadata,
      );
    }
  }

  /** Dispatch cron-context: INSERT directo con schema explícito. */
  private async dispatchToSchema(
    schemaName: string,
    userId: number,
    eventType: NotificationEventType,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
    channels: NotificationChannels,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    if (channels.internal) {
      await this.dataSource.query(
        `INSERT INTO ${q}.notifications
           (user_id, event_type, title, message, metadata, is_read, created_at)
         VALUES ($1, $2, $3, $4, $5, false, NOW())`,
        [userId, eventType as string, title, message, JSON.stringify(metadata)],
      );
    }
    if (channels.email) {
      const contact = await this.getUserContactForSchema(schemaName, userId);
      await this.sendExternalIfContactExists(
        'email',
        contact.email,
        userId,
        title,
        message,
        metadata,
      );
    }
    if (channels.whatsapp) {
      const contact = await this.getUserContactForSchema(schemaName, userId);
      await this.sendExternalIfContactExists(
        'whatsapp',
        contact.phone,
        userId,
        title,
        message,
        metadata,
      );
    }
  }

  private async sendExternalIfContactExists(
    channel: LifecycleExternalChannel,
    recipient: string | null,
    userId: number,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    if (!recipient) {
      this.logger.warn(
        `No se envió ${channel}: usuario ${userId} no tiene contacto configurado`,
      );
      return;
    }

    await this.sendExternal(channel, recipient, title, message, metadata);
  }

  private async sendExternal(
    channel: LifecycleExternalChannel,
    recipient: string,
    title: string,
    message: string,
    metadata: Record<string, unknown>,
  ): Promise<void> {
    await this.externalNotificationAdapter.send({
      channel,
      recipient,
      title,
      message,
      metadata,
    });
  }

  /** Lee notification_channels de tenant_config — HTTP context (sin schema explícito). */
  private async getChannels(): Promise<NotificationChannels> {
    const rows = await this.dataSource
      .query<
        { notification_channels: NotificationChannels }[]
      >(`SELECT notification_channels FROM tenant_config LIMIT 1`)
      .catch(() => []);
    return (
      rows[0]?.notification_channels ?? {
        internal: true,
        email: false,
        whatsapp: false,
      }
    );
  }

  /** Lee notification_channels con schema explícito — cron context. */
  private async getChannelsForSchema(
    schemaName: string,
  ): Promise<NotificationChannels> {
    const q = quoteIdent(schemaName);
    const rows = await this.dataSource
      .query<
        { notification_channels: NotificationChannels }[]
      >(`SELECT notification_channels FROM ${q}.tenant_config LIMIT 1`)
      .catch(() => []);
    return (
      rows[0]?.notification_channels ?? {
        internal: true,
        email: false,
        whatsapp: false,
      }
    );
  }

  private async getAdminIdsForSchema(schemaName: string): Promise<number[]> {
    const q = quoteIdent(schemaName);
    const rows = await this.dataSource
      .query<
        { id: number }[]
      >(`SELECT id FROM ${q}."user" WHERE role = 'ADMIN' AND is_active = true`)
      .catch((): { id: number }[] => []);
    return rows.map((r) => r.id);
  }

  private async hasBeenSentInSchema(
    schemaName: string,
    entityType: string,
    entityId: number,
    eventKey: string,
  ): Promise<boolean> {
    const q = quoteIdent(schemaName);
    const rows = await this.dataSource
      .query<{ id: number }[]>(
        `SELECT id FROM ${q}.lifecycle_notification_log
         WHERE entity_type = $1 AND entity_id = $2 AND event_key = $3`,
        [entityType, entityId, eventKey],
      )
      .catch(() => []);
    return rows.length > 0;
  }

  private async markSentInSchema(
    schemaName: string,
    entityType: string,
    entityId: number,
    eventKey: string,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    await this.dataSource.query(
      `INSERT INTO ${q}.lifecycle_notification_log
         (entity_type, entity_id, event_key, sent_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (entity_id, entity_type, event_key) DO NOTHING`,
      [entityType, entityId, eventKey],
    );
  }

  private async getAllActiveTenants(): Promise<TenantRecord[]> {
    return this.dataSource.query<TenantRecord[]>(
      `SELECT schema_name, slug FROM public.tenant WHERE is_active = true`,
    );
  }

  private async getUserContact(userId: number): Promise<UserContact> {
    try {
      const rows = await this.dataSource.query<UserContact[]>(
        `SELECT email, phone FROM "user" WHERE id = $1 AND is_active = true`,
        [userId],
      );
      return rows[0] ?? { email: null, phone: null };
    } catch {
      return { email: null, phone: null };
    }
  }

  private async getUserContactForSchema(
    schemaName: string,
    userId: number,
  ): Promise<UserContact> {
    const q = quoteIdent(schemaName);
    try {
      const rows = await this.dataSource.query<UserContact[]>(
        `SELECT email, phone FROM ${q}."user" WHERE id = $1 AND is_active = true`,
        [userId],
      );
      return rows[0] ?? { email: null, phone: null };
    } catch {
      return { email: null, phone: null };
    }
  }
}
