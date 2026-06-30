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
        severity        VARCHAR(10)  NOT NULL DEFAULT 'medium',
        description     TEXT         NOT NULL,
        status          VARCHAR(20)  NOT NULL DEFAULT 'open',
        due_date        DATE,
        evidence_photos JSONB        NOT NULL DEFAULT '[]',
        fine_amount     NUMERIC(12,2),
        fine_currency   VARCHAR(3),
        fine_status     VARCHAR(10)  NOT NULL DEFAULT 'none',
        fine_paid_at    TIMESTAMPTZ,
        notice_sent_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        resolved_notes  TEXT,
        created_by      INT
      )
    `);

    // Migración perezosa: añade las columnas nuevas a tenants ya provisionados.
    await this.dataSource.query(`
      ALTER TABLE ${q}.violations
        ADD COLUMN IF NOT EXISTS severity       VARCHAR(10) NOT NULL DEFAULT 'medium',
        ADD COLUMN IF NOT EXISTS due_date       DATE,
        ADD COLUMN IF NOT EXISTS fine_amount    NUMERIC(12,2),
        ADD COLUMN IF NOT EXISTS fine_currency  VARCHAR(3),
        ADD COLUMN IF NOT EXISTS fine_status    VARCHAR(10) NOT NULL DEFAULT 'none',
        ADD COLUMN IF NOT EXISTS fine_paid_at   TIMESTAMPTZ,
        ADD COLUMN IF NOT EXISTS notice_sent_at TIMESTAMPTZ
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

    // Línea de tiempo de actividad (creación, cambios de etapa, avisos, multas,
    // notas). Inmutable: solo se insertan eventos, nunca se editan.
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.violation_events (
        id            SERIAL PRIMARY KEY,
        violation_id  INT          NOT NULL REFERENCES ${q}.violations(id) ON DELETE CASCADE,
        event_type    VARCHAR(30)  NOT NULL,
        note          TEXT,
        metadata      JSONB        NOT NULL DEFAULT '{}',
        created_by    INT,
        created_at    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violation_events_violation_id
        ON ${q}.violation_events(violation_id, created_at DESC)
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
