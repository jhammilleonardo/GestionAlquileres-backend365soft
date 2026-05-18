import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantApplicationsProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureApplications(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.application_status_enum AS ENUM (
          'BORRADOR', 'PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.rental_applications (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        applicant_id integer NOT NULL,
        status ${q}.application_status_enum NOT NULL DEFAULT 'PENDIENTE',
        personal_data jsonb,
        employment_data jsonb,
        rental_history jsonb,
        "references" jsonb,
        documents jsonb,
        additional_notes text,
        admin_feedback text,
        screening_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_rental_applications_property FOREIGN KEY (property_id)
          REFERENCES ${q}.properties(id),
        CONSTRAINT fk_rental_applications_applicant FOREIGN KEY (applicant_id)
          REFERENCES ${q}."user"(id)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_PROPERTY ON ${q}.rental_applications(property_id);
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_APPLICANT ON ${q}.rental_applications(applicant_id);
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_STATUS ON ${q}.rental_applications(status);
    `);
  }

  async ensureScreeningFields(schemaName: string): Promise<void> {
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.rental_applications ADD COLUMN IF NOT EXISTS screening_fee_paid BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  async ensureScreeningChecklist(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.screening_final_status_enum AS ENUM (
          'APPROVED', 'REJECTED', 'REQUIRES_COSIGNER'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.screening_checklist (
        id                       SERIAL PRIMARY KEY,
        application_id           INTEGER NOT NULL UNIQUE
          REFERENCES ${q}.rental_applications(id) ON DELETE CASCADE,
        documents_verified       BOOLEAN NOT NULL DEFAULT FALSE,
        employer_call_name       VARCHAR(150),
        employer_call_phone      VARCHAR(30),
        employer_call_result     VARCHAR(50),
        previous_landlord_name   VARCHAR(150),
        previous_landlord_phone  VARCHAR(30),
        previous_landlord_result VARCHAR(50),
        blacklist_checked        BOOLEAN NOT NULL DEFAULT FALSE,
        blacklist_result         VARCHAR(50),
        notes                    TEXT,
        final_status             ${q}.screening_final_status_enum,
        reviewed_by              INTEGER REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        reviewed_at              TIMESTAMP,
        created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_screening_checklist_application_id
        ON ${q}.screening_checklist(application_id);
    `);
  }
}
