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
  }
}
