import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantInspectionsProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureInspections(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.inspections (
        id                  SERIAL PRIMARY KEY,
        property_id         INTEGER NOT NULL
          REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        unit_id             INTEGER
          REFERENCES ${q}.units(id) ON DELETE SET NULL,
        contract_id         INTEGER
          REFERENCES ${q}.contracts(id) ON DELETE SET NULL,
        type                VARCHAR(20) NOT NULL,
        scheduled_date      DATE NOT NULL,
        completed_date      DATE,
        inspector_user_id   INTEGER
          REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        notes               TEXT,
        created_by          INTEGER NOT NULL,
        created_at          TIMESTAMP NOT NULL DEFAULT now(),
        updated_at          TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_inspections_type
          CHECK (type IN ('move_in', 'move_out', 'periodic')),
        CONSTRAINT chk_inspections_status
          CHECK (status IN ('scheduled', 'in_progress', 'completed'))
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.inspection_items (
        id            SERIAL PRIMARY KEY,
        inspection_id INTEGER NOT NULL
          REFERENCES ${q}.inspections(id) ON DELETE CASCADE,
        area          VARCHAR(30) NOT NULL,
        item_name     VARCHAR(200) NOT NULL,
        condition     VARCHAR(20) NOT NULL DEFAULT 'good',
        notes         TEXT,
        photos        JSONB NOT NULL DEFAULT '[]',
        created_at    TIMESTAMP NOT NULL DEFAULT now(),
        updated_at    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_inspection_items_area
          CHECK (area IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'other')),
        CONSTRAINT chk_inspection_items_condition
          CHECK (condition IN ('good', 'fair', 'poor', 'damaged'))
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_inspections_property_id
        ON ${q}.inspections(property_id);
      CREATE INDEX IF NOT EXISTS idx_inspections_contract_id
        ON ${q}.inspections(contract_id);
      CREATE INDEX IF NOT EXISTS idx_inspections_status
        ON ${q}.inspections(status);
      CREATE INDEX IF NOT EXISTS idx_inspections_type
        ON ${q}.inspections(type);
      CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_date
        ON ${q}.inspections(scheduled_date DESC);
      CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection_id
        ON ${q}.inspection_items(inspection_id);
    `);
  }
}
