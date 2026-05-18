import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantWebsiteProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureTenantWebsite(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.tenant_website (
        id                  SERIAL PRIMARY KEY,
        subdomain           VARCHAR(100) UNIQUE,
        company_description TEXT,
        logo_url            VARCHAR(500),
        primary_color       VARCHAR(7)   NOT NULL DEFAULT '#1976d2',
        secondary_color     VARCHAR(7)   NOT NULL DEFAULT '#424242',
        contact_email       VARCHAR(255),
        contact_phone       VARCHAR(50),
        social_links        JSONB        NOT NULL DEFAULT '{}',
        meta_title          VARCHAR(200),
        meta_description    VARCHAR(500),
        is_published        BOOLEAN      NOT NULL DEFAULT false,
        created_at          TIMESTAMP    NOT NULL DEFAULT now(),
        updated_at          TIMESTAMP    NOT NULL DEFAULT now()
      );
    `);
  }

  async ensureWebsiteContacts(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.website_contacts (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL,
        phone      VARCHAR(50),
        message    TEXT         NOT NULL,
        status     VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
        user_ip    VARCHAR(45),
        created_at TIMESTAMP    NOT NULL DEFAULT now(),
        updated_at TIMESTAMP    NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_website_contacts_email
        ON ${q}.website_contacts(email);
      CREATE INDEX IF NOT EXISTS idx_website_contacts_status
        ON ${q}.website_contacts(status);
      CREATE INDEX IF NOT EXISTS idx_website_contacts_created_at
        ON ${q}.website_contacts(created_at DESC);
    `);
  }
}
