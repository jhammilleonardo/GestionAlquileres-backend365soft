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
        expense_scope          VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
        responsibility         VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
        payment_status         VARCHAR(20) NOT NULL DEFAULT 'PAID',
        amount                 DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        paid_amount            DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        currency               VARCHAR(3) NOT NULL DEFAULT 'USD',
        description            TEXT,
        date                   DATE NOT NULL,
        due_date               DATE,
        paid_date              DATE,
        vendor_id              INTEGER,
        vendor_name            VARCHAR(255),
        receipt_url            VARCHAR(255),
        invoice_number         VARCHAR(80),
        contract_id            INTEGER,
        reservation_id         INTEGER,
        maintenance_request_id INTEGER,
        affects_owner_statement BOOLEAN NOT NULL DEFAULT TRUE,
        is_reimbursable        BOOLEAN NOT NULL DEFAULT FALSE,
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
      ALTER TABLE ${q}.expenses
        ADD COLUMN IF NOT EXISTS expense_scope VARCHAR(20) NOT NULL DEFAULT 'GENERAL',
        ADD COLUMN IF NOT EXISTS responsibility VARCHAR(20) NOT NULL DEFAULT 'COMPANY',
        ADD COLUMN IF NOT EXISTS payment_status VARCHAR(20) NOT NULL DEFAULT 'PAID',
        ADD COLUMN IF NOT EXISTS paid_amount DECIMAL(12, 2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
        ADD COLUMN IF NOT EXISTS due_date DATE,
        ADD COLUMN IF NOT EXISTS paid_date DATE,
        ADD COLUMN IF NOT EXISTS invoice_number VARCHAR(80),
        ADD COLUMN IF NOT EXISTS contract_id INTEGER,
        ADD COLUMN IF NOT EXISTS reservation_id INTEGER,
        ADD COLUMN IF NOT EXISTS maintenance_request_id INTEGER,
        ADD COLUMN IF NOT EXISTS affects_owner_statement BOOLEAN NOT NULL DEFAULT TRUE,
        ADD COLUMN IF NOT EXISTS is_reimbursable BOOLEAN NOT NULL DEFAULT FALSE;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.expense_payments (
        id                  SERIAL PRIMARY KEY,
        expense_id          INTEGER NOT NULL REFERENCES ${q}.expenses(id) ON DELETE CASCADE,
        amount              DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        currency            VARCHAR(3) NOT NULL DEFAULT 'USD',
        payment_date        DATE NOT NULL,
        payment_method      VARCHAR(60),
        reference_number    VARCHAR(120),
        notes               TEXT,
        receipt_url         VARCHAR(255),
        accounting_status   VARCHAR(30) NOT NULL DEFAULT 'pending_posting',
        journal_entry_id    INTEGER,
        created_by          INTEGER,
        created_at          TIMESTAMP NOT NULL DEFAULT now()
      );

      CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON ${q}.expenses(property_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_unit_id ON ${q}.expenses(unit_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON ${q}.expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON ${q}.expenses(category);
      CREATE INDEX IF NOT EXISTS idx_expenses_scope ON ${q}.expenses(expense_scope);
      CREATE INDEX IF NOT EXISTS idx_expenses_payment_status ON ${q}.expenses(payment_status);
      CREATE INDEX IF NOT EXISTS idx_expenses_maintenance_request_id ON ${q}.expenses(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS idx_expense_payments_expense_id ON ${q}.expense_payments(expense_id);
      CREATE INDEX IF NOT EXISTS idx_expense_payments_date ON ${q}.expense_payments(payment_date DESC);
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
