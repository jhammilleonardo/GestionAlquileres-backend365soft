import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantAuditComplianceProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureViolations(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.violations (
        id              SERIAL PRIMARY KEY,
        property_id     INT          NOT NULL,
        unit_id         INT,
        tenant_id       INT          NOT NULL,
        type            VARCHAR(50)  NOT NULL,
        description     TEXT         NOT NULL,
        status          VARCHAR(20)  NOT NULL DEFAULT 'open',
        evidence_photos JSONB        NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        resolved_notes  TEXT,
        created_by      INT
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_property_id
        ON ${q}.violations(property_id)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_tenant_id
        ON ${q}.violations(tenant_id)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_status
        ON ${q}.violations(status)
    `);
  }

  async ensureAuditLogs(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.audit_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        action      VARCHAR(30) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id   INTEGER NOT NULL,
        old_values  JSONB,
        new_values  JSONB,
        ip_address  VARCHAR(45),
        user_agent  VARCHAR(500),
        timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
        ON ${q}.audit_logs(entity_type, entity_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
        ON ${q}.audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action
        ON ${q}.audit_logs(action);
    `);
  }
}
