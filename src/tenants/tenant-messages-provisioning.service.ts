import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

/**
 * Provisiona la tabla de mensajería interna (admin ↔ inquilino/propietario)
 * en el schema de cada tenant.
 */
@Injectable()
export class TenantMessagesProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureMessages(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.internal_messages (
        id SERIAL PRIMARY KEY,
        sender_id integer NOT NULL,
        recipient_id integer NOT NULL,
        body text NOT NULL,
        is_read boolean NOT NULL DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_internal_messages_recipient
        ON ${q}.internal_messages(recipient_id, is_read);
      CREATE INDEX IF NOT EXISTS idx_internal_messages_sender
        ON ${q}.internal_messages(sender_id);
      CREATE INDEX IF NOT EXISTS idx_internal_messages_created
        ON ${q}.internal_messages(created_at DESC);
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.internal_message_attachments (
        id SERIAL PRIMARY KEY,
        message_id integer REFERENCES ${q}.internal_messages(id) ON DELETE CASCADE,
        file_url text NOT NULL,
        file_name text NOT NULL,
        file_type text NOT NULL,
        file_size bigint NOT NULL DEFAULT 0,
        uploaded_by integer NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_internal_message_attachments_message
        ON ${q}.internal_message_attachments(message_id);
    `);
  }
}
