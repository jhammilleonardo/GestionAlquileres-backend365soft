import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantExpensesProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureExpenses(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.expenses (
        id                     SERIAL PRIMARY KEY,
        property_id            INTEGER NOT NULL REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        unit_id                INTEGER REFERENCES ${q}.units(id) ON DELETE SET NULL,
        category               VARCHAR(50) NOT NULL,
        amount                 DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        currency               VARCHAR(3) NOT NULL DEFAULT 'USD',
        description            TEXT,
        date                   DATE NOT NULL,
        vendor_id              INTEGER,
        vendor_name            VARCHAR(255),
        receipt_url            VARCHAR(255),
        is_recurring           BOOLEAN DEFAULT FALSE,
        recurrence_interval    VARCHAR(20),
        recurrence_start_date  DATE,
        recurrence_end_date    DATE,
        recurring_expense_id   INTEGER,
        notes                  TEXT,
        created_by             INTEGER,
        updated_by             INTEGER,
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        updated_at             TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON ${q}.expenses(property_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_unit_id ON ${q}.expenses(unit_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON ${q}.expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON ${q}.expenses(category);
    `);
  }

  async upgradeExpenses(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.ensureExpenses(schemaName);

    await this.dataSource.query(
      `ALTER TABLE ${q}.expenses DROP COLUMN IF EXISTS tenant_id`,
    );

    await this.dataSource.query(
      `ALTER TABLE ${q}.tenant_config ADD COLUMN IF NOT EXISTS custom_expense_categories JSONB NOT NULL DEFAULT '[]'`,
    );
  }
}
