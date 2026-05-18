import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantMaintenanceProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureMaintenance(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.maintenance_request_type_enum AS ENUM ('MAINTENANCE', 'GENERAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.maintenance_category_enum AS ENUM ('GENERAL', 'ACCESORIOS', 'ELECTRICO', 'CLIMATIZACION', 'LLAVE_CERRADURA', 'ILUMINACION', 'AFUERA', 'PLOMERIA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.permission_to_enter_enum AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.maintenance_status_enum AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.maintenance_priority_enum AS ENUM ('LOW', 'NORMAL', 'HIGH');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.maintenance_requests (
        id SERIAL PRIMARY KEY,
        ticket_number character varying NOT NULL UNIQUE,
        request_type ${q}.maintenance_request_type_enum NOT NULL DEFAULT 'MAINTENANCE',
        category ${q}.maintenance_category_enum,
        title character varying NOT NULL,
        description text NOT NULL,
        permission_to_enter ${q}.permission_to_enter_enum NOT NULL DEFAULT 'NOT_APPLICABLE',
        has_pets boolean NOT NULL DEFAULT false,
        entry_notes text,
        status ${q}.maintenance_status_enum NOT NULL DEFAULT 'NEW',
        priority ${q}.maintenance_priority_enum NOT NULL DEFAULT 'NORMAL',
        due_date date,
        assigned_to integer,
        tenant_id integer NOT NULL,
        contract_id integer NOT NULL,
        property_id integer NOT NULL,
        current_stage VARCHAR(30) NOT NULL DEFAULT 'REPORTED',
        owner_authorized BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_requests_contract FOREIGN KEY (contract_id)
          REFERENCES ${q}.contracts(id),
        CONSTRAINT fk_maintenance_requests_property FOREIGN KEY (property_id)
          REFERENCES ${q}.properties(id)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.maintenance_messages (
        id SERIAL PRIMARY KEY,
        maintenance_request_id integer NOT NULL,
        user_id integer NOT NULL,
        message text NOT NULL,
        send_to_resident boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_messages_request FOREIGN KEY (maintenance_request_id)
          REFERENCES ${q}.maintenance_requests(id) ON DELETE CASCADE
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.maintenance_attachments (
        id SERIAL PRIMARY KEY,
        maintenance_request_id integer,
        message_id integer,
        file_url character varying NOT NULL,
        file_name character varying NOT NULL,
        file_type character varying NOT NULL,
        file_size bigint NOT NULL,
        uploaded_by integer NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_attachments_request FOREIGN KEY (maintenance_request_id)
          REFERENCES ${q}.maintenance_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_maintenance_attachments_message FOREIGN KEY (message_id)
          REFERENCES ${q}.maintenance_messages(id) ON DELETE CASCADE
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TENANT ON ${q}.maintenance_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_CONTRACT ON ${q}.maintenance_requests(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PROPERTY ON ${q}.maintenance_requests(property_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_STATUS ON ${q}.maintenance_requests(status);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PRIORITY ON ${q}.maintenance_requests(priority);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TYPE ON ${q}.maintenance_requests(request_type);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_MESSAGES_REQUEST ON ${q}.maintenance_messages(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_REQUEST ON ${q}.maintenance_attachments(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_MESSAGE ON ${q}.maintenance_attachments(message_id);
    `);

    await this.ensureStageHistory(schemaName);
  }

  async ensureStageFields(schemaName: string): Promise<void> {
    const table = `${quoteIdent(schemaName)}.maintenance_requests`;
    const alterations = [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS current_stage VARCHAR(30) NOT NULL DEFAULT 'REPORTED'`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS owner_authorized BOOLEAN NOT NULL DEFAULT FALSE`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
    ];

    for (const sql of alterations) {
      await this.dataSource.query(sql);
    }
  }

  async ensureStageHistory(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.maintenance_stage_history (
        id                   SERIAL PRIMARY KEY,
        request_id           INTEGER NOT NULL
          REFERENCES ${q}.maintenance_requests(id) ON DELETE CASCADE,
        from_stage           VARCHAR(30),
        to_stage             VARCHAR(30) NOT NULL,
        changed_by_user_id   INTEGER NOT NULL,
        notes                TEXT,
        photos               JSONB NOT NULL DEFAULT '[]',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_stage_history_request_id
        ON ${q}.maintenance_stage_history(request_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_stage_history_created_at
        ON ${q}.maintenance_stage_history(created_at DESC);
    `);
  }

  async ensureVendors(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.vendors (
        id             SERIAL        PRIMARY KEY,
        name           VARCHAR(200)  NOT NULL,
        specialty      VARCHAR(50)   NOT NULL,
        phone          VARCHAR(30),
        email          VARCHAR(200),
        address        TEXT,
        rate_per_hour  DECIMAL(10,2),
        rate_flat      DECIMAL(10,2),
        is_active      BOOLEAN       NOT NULL DEFAULT true,
        average_rating DECIMAL(3,2),
        notes          TEXT,
        created_by     INT,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_specialty
        ON ${q}.vendors(specialty)
        WHERE is_active = true
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_active
        ON ${q}.vendors(is_active)
    `);
  }

  async ensureVendorFields(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const table = `${q}.maintenance_requests`;
    const alterations = [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_id             INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rating         INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rating_comment TEXT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rated_at       TIMESTAMPTZ`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rated_by       INT`,
    ];

    for (const sql of alterations) {
      await this.dataSource.query(sql);
    }

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_vendor_id
        ON ${q}.maintenance_requests(vendor_id)
        WHERE vendor_id IS NOT NULL
    `);
  }
}
