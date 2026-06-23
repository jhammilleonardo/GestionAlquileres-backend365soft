import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

const ACCOUNTING_SCHEMA_VERSION = 2;

interface ChartAccountSeed {
  code: string;
  name: string;
  type: 'asset' | 'liability' | 'equity' | 'income' | 'expense';
  countryScope?: string[];
}

const BASE_CHART_OF_ACCOUNTS: ChartAccountSeed[] = [
  { code: '1000', name: 'Assets', type: 'asset' },
  { code: '1100', name: 'Operating cash and bank', type: 'asset' },
  { code: '1110', name: 'Trust account', type: 'asset', countryScope: ['US'] },
  { code: '1200', name: 'Accounts receivable', type: 'asset' },
  { code: '1300', name: 'Tenant prepaid payments', type: 'asset' },
  { code: '2000', name: 'Liabilities', type: 'liability' },
  { code: '2100', name: 'Owner payable', type: 'liability' },
  { code: '2200', name: 'Security deposits', type: 'liability' },
  { code: '2300', name: 'Vendor payable', type: 'liability' },
  { code: '3000', name: 'Equity', type: 'equity' },
  { code: '4000', name: 'Rental income', type: 'income' },
  { code: '4100', name: 'Late fee income', type: 'income' },
  { code: '4200', name: 'Management fee income', type: 'income' },
  { code: '4300', name: 'Other income', type: 'income' },
  { code: '5000', name: 'Expenses', type: 'expense' },
  { code: '5200', name: 'Maintenance expense', type: 'expense' },
  { code: '5300', name: 'Cleaning expense', type: 'expense' },
  { code: '5400', name: 'Taxes and insurance', type: 'expense' },
  { code: '5900', name: 'Suspense account', type: 'expense' },
];

@Injectable()
export class TenantAccountingProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureAccounting(schemaName: string): Promise<void> {
    await this.ensureTables(schemaName);
    await this.seedChartOfAccounts(schemaName);
    await this.ensureDomainPostingColumns(schemaName);
    await this.markSchemaVersion(schemaName);
  }

  async seedChartOfAccounts(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    for (const account of BASE_CHART_OF_ACCOUNTS) {
      await this.dataSource.query(
        `
          INSERT INTO ${q}.chart_of_accounts
            (code, name, type, country_scope, is_system, is_active, created_at, updated_at)
          VALUES ($1, $2, $3, $4::jsonb, true, true, NOW(), NOW())
          ON CONFLICT (code) DO UPDATE SET
            name = EXCLUDED.name,
            type = EXCLUDED.type,
            country_scope = EXCLUDED.country_scope,
            is_system = true,
            updated_at = NOW()
        `,
        [
          account.code,
          account.name,
          account.type,
          JSON.stringify(account.countryScope ?? []),
        ],
      );
    }
  }

  private async ensureTables(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.chart_of_accounts (
        id             SERIAL PRIMARY KEY,
        code           VARCHAR(20) NOT NULL UNIQUE,
        name           VARCHAR(160) NOT NULL,
        type           VARCHAR(30) NOT NULL CHECK (type IN ('asset', 'liability', 'equity', 'income', 'expense')),
        parent_id      INTEGER REFERENCES ${q}.chart_of_accounts(id) ON DELETE SET NULL,
        country_scope  JSONB NOT NULL DEFAULT '[]',
        is_system      BOOLEAN NOT NULL DEFAULT false,
        is_active      BOOLEAN NOT NULL DEFAULT true,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.journal_entries (
        id                  SERIAL PRIMARY KEY,
        entry_number        VARCHAR(40) NOT NULL UNIQUE,
        entry_date          DATE NOT NULL,
        description         TEXT NOT NULL,
        source_module       VARCHAR(60),
        source_id           VARCHAR(80),
        basis               VARCHAR(20) NOT NULL DEFAULT 'cash' CHECK (basis IN ('cash', 'accrual')),
        status              VARCHAR(20) NOT NULL DEFAULT 'posted' CHECK (status IN ('draft', 'posted', 'reversed')),
        posted_at           TIMESTAMPTZ,
        reversed_entry_id   INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL,
        metadata            JSONB NOT NULL DEFAULT '{}',
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.journal_lines (
        id                  SERIAL PRIMARY KEY,
        journal_entry_id    INTEGER NOT NULL REFERENCES ${q}.journal_entries(id) ON DELETE CASCADE,
        account_id          INTEGER NOT NULL REFERENCES ${q}.chart_of_accounts(id),
        property_id         INTEGER REFERENCES ${q}.properties(id) ON DELETE SET NULL,
        unit_id             INTEGER REFERENCES ${q}.units(id) ON DELETE SET NULL,
        owner_id            INTEGER REFERENCES ${q}.rental_owners(id) ON DELETE SET NULL,
        tenant_user_id      INTEGER REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        vendor_id           INTEGER,
        contract_id         INTEGER REFERENCES ${q}.contracts(id) ON DELETE SET NULL,
        payment_id          INTEGER REFERENCES ${q}.payments(id) ON DELETE SET NULL,
        expense_id          INTEGER REFERENCES ${q}.expenses(id) ON DELETE SET NULL,
        debit               NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (debit >= 0),
        credit              NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (credit >= 0),
        memo                TEXT,
        created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CHECK (
          (debit > 0 AND credit = 0)
          OR (credit > 0 AND debit = 0)
        )
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.accounting_outbox (
        id                 SERIAL PRIMARY KEY,
        event_type         VARCHAR(80) NOT NULL,
        aggregate_type     VARCHAR(80) NOT NULL,
        aggregate_id       VARCHAR(80) NOT NULL,
        payload            JSONB NOT NULL DEFAULT '{}',
        status             VARCHAR(20) NOT NULL DEFAULT 'pending'
          CHECK (status IN ('pending', 'processing', 'posted', 'failed')),
        attempts           INTEGER NOT NULL DEFAULT 0,
        last_error         TEXT,
        next_retry_at      TIMESTAMPTZ,
        journal_entry_id   INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL,
        created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (event_type, aggregate_type, aggregate_id)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.accounting_periods (
        id              SERIAL PRIMARY KEY,
        period_year     INTEGER NOT NULL CHECK (period_year BETWEEN 2000 AND 2100),
        period_month    INTEGER NOT NULL CHECK (period_month BETWEEN 1 AND 12),
        status          VARCHAR(20) NOT NULL DEFAULT 'open'
          CHECK (status IN ('open', 'closed')),
        closed_at       TIMESTAMPTZ,
        closed_by       INTEGER,
        reopened_at     TIMESTAMPTZ,
        reopened_by     INTEGER,
        reopen_reason   TEXT,
        created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (period_year, period_month)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.accounting_schema_version (
        id             INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
        version        INTEGER NOT NULL,
        applied_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_chart_of_accounts_type
        ON ${q}.chart_of_accounts(type);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_date
        ON ${q}.journal_entries(entry_date DESC);
      CREATE INDEX IF NOT EXISTS idx_journal_entries_source
        ON ${q}.journal_entries(source_module, source_id);
      CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_source_unique
        ON ${q}.journal_entries(source_module, source_id)
        WHERE source_module IS NOT NULL AND source_id IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_journal_lines_entry
        ON ${q}.journal_lines(journal_entry_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_property
        ON ${q}.journal_lines(property_id);
      CREATE INDEX IF NOT EXISTS idx_journal_lines_owner
        ON ${q}.journal_lines(owner_id);
      CREATE INDEX IF NOT EXISTS idx_accounting_outbox_status
        ON ${q}.accounting_outbox(status, next_retry_at);
      CREATE INDEX IF NOT EXISTS idx_accounting_periods_status
        ON ${q}.accounting_periods(status, period_year, period_month);
    `);
  }

  private async ensureDomainPostingColumns(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      ALTER TABLE ${q}.payments
        ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(30) NOT NULL DEFAULT 'not_posted',
        ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL;
    `);

    await this.dataSource.query(`
      ALTER TABLE ${q}.expenses
        ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(30) NOT NULL DEFAULT 'not_posted',
        ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL;
    `);

    await this.dataSource.query(`
      ALTER TABLE ${q}.owner_statements
        ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(30) NOT NULL DEFAULT 'not_posted',
        ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS transfer_journal_entry_id INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL;
    `);

    await this.dataSource.query(`
      ALTER TABLE ${q}.payment_refunds
        ADD COLUMN IF NOT EXISTS accounting_status VARCHAR(30) NOT NULL DEFAULT 'not_posted',
        ADD COLUMN IF NOT EXISTS journal_entry_id INTEGER REFERENCES ${q}.journal_entries(id) ON DELETE SET NULL;
    `);
  }

  private async markSchemaVersion(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        INSERT INTO ${q}.accounting_schema_version (id, version, applied_at)
        VALUES (1, $1, NOW())
        ON CONFLICT (id) DO UPDATE SET
          version = GREATEST(${q}.accounting_schema_version.version, EXCLUDED.version),
          applied_at = NOW()
      `,
      [ACCOUNTING_SCHEMA_VERSION],
    );
  }
}
