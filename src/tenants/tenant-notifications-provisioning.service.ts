import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class TenantNotificationsProvisioningService {
  private readonly notificationEventTypes = Object.values(
    NotificationEventType,
  );

  constructor(private readonly dataSource: DataSource) {}

  async ensureNotifications(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const enumValuesSql = this.notificationEventTypes
      .map((eventType) => `'${eventType.replace(/'/g, "''")}'`)
      .join(',\n          ');

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.notification_event_type_enum AS ENUM (
          ${enumValuesSql}
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.notifications (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL,
        event_type ${q}.notification_event_type_enum NOT NULL,
        title character varying(255) NOT NULL,
        message text NOT NULL,
        metadata jsonb DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        is_read boolean NOT NULL DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.notification_templates (
        id SERIAL PRIMARY KEY,
        event_type ${q}.notification_event_type_enum NOT NULL UNIQUE,
        title_template character varying(255) NOT NULL,
        message_template text NOT NULL,
        variables text[] DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_USER_ID ON ${q}.notifications(user_id);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_EVENT_TYPE ON ${q}.notifications(event_type);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_IS_READ ON ${q}.notifications(is_read);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_CREATED_AT ON ${q}.notifications(created_at DESC);
    `);
  }

  async upgradeNotificationEventTypes(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const [typeExists] = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'notification_event_type_enum'
           AND n.nspname = $1
       )`,
      [schemaName],
    );

    if (!typeExists?.exists) {
      await this.ensureNotifications(schemaName);
      return;
    }

    for (const eventType of this.notificationEventTypes) {
      const safeEventType = eventType.replace(/'/g, "''");
      await this.dataSource.query(`
        ALTER TYPE ${q}.notification_event_type_enum
          ADD VALUE IF NOT EXISTS '${safeEventType}';
      `);
    }

    await this.ensureNotifications(schemaName);
  }

  async ensureLifecycleNotificationLog(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.lifecycle_notification_log (
        id            SERIAL PRIMARY KEY,
        entity_type   VARCHAR(50)  NOT NULL,
        entity_id     INTEGER      NOT NULL,
        event_key     VARCHAR(100) NOT NULL,
        sent_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_lifecycle_notif_log UNIQUE (entity_id, entity_type, event_key)
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_lifecycle_notif_log_entity
        ON ${q}.lifecycle_notification_log(entity_type, entity_id)
    `);
  }
}
