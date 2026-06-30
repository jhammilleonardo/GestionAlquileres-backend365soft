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

    await this.ensureInspectionTemplates(schemaName);
  }

  /**
   * Plantillas reutilizables de checklist (estilo Buildium): un administrador
   * define una vez las áreas e ítems y luego crea inspecciones a partir de
   * ellas. Se siembra una plantilla por defecto si el tenant no tiene ninguna.
   */
  private async ensureInspectionTemplates(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.inspection_templates (
        id          SERIAL PRIMARY KEY,
        name        VARCHAR(120) NOT NULL,
        type        VARCHAR(20),
        items       JSONB NOT NULL DEFAULT '[]',
        is_default  BOOLEAN NOT NULL DEFAULT false,
        created_by  INTEGER REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        created_at  TIMESTAMP NOT NULL DEFAULT now(),
        updated_at  TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_inspection_templates_type
          CHECK (type IS NULL OR type IN ('move_in', 'move_out', 'periodic'))
      );
    `);

    const seedItems = JSON.stringify(DEFAULT_TEMPLATE_ITEMS);
    await this.dataSource.query(
      `INSERT INTO ${q}.inspection_templates (name, type, items, is_default)
       SELECT 'Checklist estándar', NULL, $1::jsonb, true
        WHERE NOT EXISTS (SELECT 1 FROM ${q}.inspection_templates)`,
      [seedItems],
    );
  }
}

/** Áreas e ítems base que alimentan la plantilla por defecto sembrada. */
const DEFAULT_TEMPLATE_ITEMS: Array<{ area: string; item_name: string }> = [
  { area: 'living_room', item_name: 'Paredes' },
  { area: 'living_room', item_name: 'Piso' },
  { area: 'living_room', item_name: 'Techo' },
  { area: 'living_room', item_name: 'Ventanas' },
  { area: 'living_room', item_name: 'Iluminación' },
  { area: 'kitchen', item_name: 'Mesón' },
  { area: 'kitchen', item_name: 'Fregadero' },
  { area: 'kitchen', item_name: 'Gabinetes' },
  { area: 'kitchen', item_name: 'Electrodomésticos' },
  { area: 'kitchen', item_name: 'Pisos' },
  { area: 'bathroom', item_name: 'Inodoro' },
  { area: 'bathroom', item_name: 'Lavamanos' },
  { area: 'bathroom', item_name: 'Ducha' },
  { area: 'bathroom', item_name: 'Grifería' },
  { area: 'bathroom', item_name: 'Azulejos' },
  { area: 'bedroom', item_name: 'Paredes' },
  { area: 'bedroom', item_name: 'Piso' },
  { area: 'bedroom', item_name: 'Closet' },
  { area: 'bedroom', item_name: 'Ventanas' },
  { area: 'exterior', item_name: 'Fachada' },
  { area: 'exterior', item_name: 'Jardín' },
  { area: 'exterior', item_name: 'Estacionamiento' },
];
