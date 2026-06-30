import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import {
  PaymentLedgerService,
  AdminPaymentLedger,
} from '../payments/payment-ledger.service';
import { TenantsService } from '../tenants/tenants.service';
import {
  AccountingReportsService,
  BalanceSheet,
  IncomeStatement,
  TrialBalance,
} from './accounting-reports.service';
import { DateRangeQueryDto } from './dto/accounting-query.dto';
import { MoneyDecimal, MONEY_ROUNDING } from '../common/money';

export interface AccountingTenantProfile {
  country: string;
  currency: string;
  rental_type: string;
  occupancy_tax_pct: number;
  accounting_basis: string;
  tax_id: string | null;
  legal_name: string | null;
  tax_regime: string | null;
}

export interface AccountingTaxProfile {
  country: string;
  tax_id_label: string;
  tax_id: string | null;
  legal_name: string | null;
  accounting_basis: string;
  required_reports: string[];
  operational_notes: string[];
}

export interface AccountingPayable {
  id: number;
  vendor_name: string | null;
  property_id: number;
  property_name: string | null;
  category: string;
  due_date: string;
  amount: number;
  currency: string;
  invoice_number: string | null;
}

export interface AccountingPayablesSummary {
  total: number;
  count: number;
  data: AccountingPayable[];
}

export interface AccountingOwnerStatement {
  id: number;
  rental_owner_id: number;
  owner_name: string | null;
  property_id: number;
  property_name: string | null;
  period_month: number;
  period_year: number;
  gross_rent: number;
  maintenance_deduction: number;
  management_commission: number;
  net_amount: number;
  currency: string;
  status: string;
  transferred_at: string | null;
}

export interface AccountingOwnerSummary {
  pending_total: number;
  transferred_total: number;
  statement_count: number;
  data: AccountingOwnerStatement[];
}

export interface AccountingBankAccountSummary {
  id: number;
  name: string;
  bank_name: string | null;
  currency: string;
  gl_account_code: string;
  gl_account_name: string;
  book_balance: number;
  imported_transactions: number;
  matched_transactions: number;
  last_reconciled_at: string | null;
}

export interface AccountingBankSummary {
  account_count: number;
  total_book_balance: number;
  unreconciled_transactions: number;
  data: AccountingBankAccountSummary[];
}

export interface AccountingDashboard {
  generated_at: string;
  profile: AccountingTenantProfile;
  reports: {
    trial_balance: TrialBalance;
    balance_sheet: BalanceSheet;
    income_statement: IncomeStatement;
  };
  payment_ledger: AdminPaymentLedger;
  payables: AccountingPayablesSummary;
  owners: AccountingOwnerSummary;
  banks: AccountingBankSummary;
  tax_profile: AccountingTaxProfile;
}

interface TenantConfigRow {
  country: string | null;
  currency: string | null;
  rental_type: string | null;
  occupancy_tax_pct: string | number | null;
  accounting_basis: string | null;
  tax_id: string | null;
  legal_name: string | null;
  tax_regime: string | null;
}

interface PendingExpenseRow {
  id: number;
  vendor_name: string | null;
  property_id: number;
  property_name: string | null;
  category: string;
  due_date: string;
  amount: string | number;
  currency: string | null;
  invoice_number: string | null;
}

interface PendingExpenseTotalRow {
  total: string | number | null;
  count: string | number;
}

interface OwnerStatementRow {
  id: number;
  rental_owner_id: number;
  owner_name: string | null;
  property_id: number;
  property_name: string | null;
  period_month: string | number;
  period_year: string | number;
  gross_rent: string | number;
  maintenance_deduction: string | number;
  management_commission: string | number;
  net_amount: string | number;
  currency: string | null;
  status: string;
  transferred_at: string | null;
}

interface OwnerStatementTotalRow {
  pending_total: string | number | null;
  transferred_total: string | number | null;
  statement_count: string | number;
}

interface BankSummaryRow {
  id: number;
  name: string;
  bank_name: string | null;
  currency: string | null;
  gl_account_code: string;
  gl_account_name: string;
  book_balance: string | number | null;
  imported_transactions: string | number;
  matched_transactions: string | number;
  last_reconciled_at: string | null;
}

@Injectable()
export class AccountingDashboardService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly reportsService: AccountingReportsService,
    private readonly paymentLedgerService: PaymentLedgerService,
  ) {}

  async getDashboard(
    tenantSlug: string,
    range: DateRangeQueryDto = {},
  ): Promise<AccountingDashboard> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    const schemaName = tenant.schema_name;
    const asOf = range.to ?? new Date().toISOString().slice(0, 10);

    const [
      profile,
      trialBalance,
      balanceSheet,
      incomeStatement,
      paymentLedger,
      payables,
      owners,
      banks,
    ] = await Promise.all([
      this.getProfile(schemaName),
      this.reportsService.getTrialBalance(tenantSlug, range),
      this.reportsService.getBalanceSheet(tenantSlug, { asOf }),
      this.reportsService.getIncomeStatement(tenantSlug, range),
      this.paymentLedgerService.getAdminLedger(schemaName),
      this.getPendingPayables(schemaName, range),
      this.getOwnerSummary(schemaName, range),
      this.getBankSummary(schemaName),
    ]);

    return {
      generated_at: new Date().toISOString(),
      profile,
      reports: {
        trial_balance: trialBalance,
        balance_sheet: balanceSheet,
        income_statement: incomeStatement,
      },
      payment_ledger: paymentLedger,
      payables,
      owners,
      banks,
      tax_profile: this.getTaxProfile(profile),
    };
  }

  private async getProfile(
    schemaName: string,
  ): Promise<AccountingTenantProfile> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<TenantConfigRow[]>(
      `
      SELECT country, currency, rental_type, occupancy_tax_pct,
             accounting_basis, tax_id, legal_name, tax_regime
      FROM ${schema}.tenant_config
      LIMIT 1
      `,
    );
    const row = rows[0];

    return {
      country: row?.country ?? 'BO',
      currency: row?.currency ?? 'BOB',
      rental_type: row?.rental_type ?? 'BOTH',
      occupancy_tax_pct: this.toNumber(row?.occupancy_tax_pct),
      accounting_basis: row?.accounting_basis ?? 'cash',
      tax_id: row?.tax_id ?? null,
      legal_name: row?.legal_name ?? null,
      tax_regime: row?.tax_regime ?? null,
    };
  }

  private getTaxProfile(
    profile: AccountingTenantProfile,
  ): AccountingTaxProfile {
    if (profile.country === 'US') {
      return {
        country: profile.country,
        tax_id_label: 'EIN / SSN',
        tax_id: profile.tax_id,
        legal_name: profile.legal_name,
        accounting_basis: profile.accounting_basis,
        required_reports: [
          '1099-MISC',
          '1099-NEC',
          'Owner statements',
          'Vendor W-9',
        ],
        operational_notes: [
          'Separar propietarios y proveedores para reportes 1099.',
          'Mantener cuenta fiduciaria si se administran fondos de terceros.',
          'Conservar soporte de depósitos, reembolsos y comisiones por propiedad.',
        ],
      };
    }

    if (profile.country === 'BO') {
      return {
        country: profile.country,
        tax_id_label: 'NIT',
        tax_id: profile.tax_id,
        legal_name: profile.legal_name,
        accounting_basis: profile.accounting_basis,
        required_reports: [
          'SIAT / Facturación',
          'IVA',
          'IT',
          'IUE',
          'RC-IVA cuando aplique',
        ],
        operational_notes: [
          'Registrar NIT, razón social y régimen tributario del tenant.',
          'Separar alquiler largo plazo, hospedaje corto plazo y comisiones.',
          'Controlar facturas, recibos, moneda BOB y tipo de cambio cuando exista USD.',
        ],
      };
    }

    return {
      country: profile.country,
      tax_id_label: 'Tax ID',
      tax_id: profile.tax_id,
      legal_name: profile.legal_name,
      accounting_basis: profile.accounting_basis,
      required_reports: [
        'Income statement',
        'Expense detail',
        'Owner statements',
      ],
      operational_notes: [
        'Configurar reglas fiscales locales antes de emitir reportes tributarios.',
      ],
    };
  }

  private async getPendingPayables(
    schemaName: string,
    range: DateRangeQueryDto,
  ): Promise<AccountingPayablesSummary> {
    const schema = quoteIdent(schemaName);
    const params = [range.from ?? null, range.to ?? null];
    const where = `
      WHERE e.payment_status = 'PENDING'
        AND ($1::date IS NULL OR e.date >= $1)
        AND ($2::date IS NULL OR e.date <= $2)
    `;

    const [totals, rows] = await Promise.all([
      this.dataSource.query<PendingExpenseTotalRow[]>(
        `
        SELECT COALESCE(SUM(e.amount), 0) AS total, COUNT(*)::int AS count
        FROM ${schema}.expenses e
        ${where}
        `,
        params,
      ),
      this.dataSource.query<PendingExpenseRow[]>(
        `
        SELECT e.id, e.vendor_name, e.property_id, p.title AS property_name,
               e.category, e.date::text AS due_date, e.amount, e.currency,
               e.invoice_number
        FROM ${schema}.expenses e
        LEFT JOIN ${schema}.properties p ON p.id = e.property_id
        ${where}
        ORDER BY e.date ASC, e.id DESC
        LIMIT 10
        `,
        params,
      ),
    ]);

    return {
      total: this.round2(this.toNumber(totals[0]?.total)),
      count: Number(totals[0]?.count ?? 0),
      data: rows.map((row) => ({
        id: row.id,
        vendor_name: row.vendor_name,
        property_id: row.property_id,
        property_name: row.property_name,
        category: row.category,
        due_date: row.due_date,
        amount: this.toNumber(row.amount),
        currency: row.currency ?? 'BOB',
        invoice_number: row.invoice_number,
      })),
    };
  }

  private async getOwnerSummary(
    schemaName: string,
    range: DateRangeQueryDto,
  ): Promise<AccountingOwnerSummary> {
    const schema = quoteIdent(schemaName);
    const params = [range.from ?? null, range.to ?? null];
    const where = `
      WHERE ($1::date IS NULL OR make_date(os.period_year, os.period_month, 1) >= date_trunc('month', $1::date)::date)
        AND ($2::date IS NULL OR make_date(os.period_year, os.period_month, 1) <= date_trunc('month', $2::date)::date)
    `;

    const [totals, rows] = await Promise.all([
      this.dataSource.query<OwnerStatementTotalRow[]>(
        `
        SELECT
          COALESCE(SUM(os.net_amount) FILTER (WHERE os.status = 'pending'), 0) AS pending_total,
          COALESCE(SUM(os.net_amount) FILTER (WHERE os.status = 'transferred'), 0) AS transferred_total,
          COUNT(*)::int AS statement_count
        FROM ${schema}.owner_statements os
        ${where}
        `,
        params,
      ),
      this.dataSource.query<OwnerStatementRow[]>(
        `
        SELECT os.id, os.rental_owner_id, ro.name AS owner_name,
               os.property_id, p.title AS property_name,
               os.period_month, os.period_year, os.gross_rent,
               os.maintenance_deduction, os.management_commission,
               os.net_amount, os.currency, os.status,
               os.transferred_at::text
        FROM ${schema}.owner_statements os
        LEFT JOIN ${schema}.rental_owners ro ON ro.id = os.rental_owner_id
        LEFT JOIN ${schema}.properties p ON p.id = os.property_id
        ${where}
        ORDER BY os.period_year DESC, os.period_month DESC, os.id DESC
        LIMIT 10
        `,
        params,
      ),
    ]);

    return {
      pending_total: this.round2(this.toNumber(totals[0]?.pending_total)),
      transferred_total: this.round2(
        this.toNumber(totals[0]?.transferred_total),
      ),
      statement_count: Number(totals[0]?.statement_count ?? 0),
      data: rows.map((row) => ({
        id: row.id,
        rental_owner_id: row.rental_owner_id,
        owner_name: row.owner_name,
        property_id: row.property_id,
        property_name: row.property_name,
        period_month: Number(row.period_month),
        period_year: Number(row.period_year),
        gross_rent: this.toNumber(row.gross_rent),
        maintenance_deduction: this.toNumber(row.maintenance_deduction),
        management_commission: this.toNumber(row.management_commission),
        net_amount: this.toNumber(row.net_amount),
        currency: row.currency ?? 'BOB',
        status: row.status,
        transferred_at: row.transferred_at,
      })),
    };
  }

  private async getBankSummary(
    schemaName: string,
  ): Promise<AccountingBankSummary> {
    const schema = quoteIdent(schemaName);
    const hasBankTables = await this.tableExists(schemaName, 'bank_accounts');
    if (!hasBankTables) {
      return {
        account_count: 0,
        total_book_balance: 0,
        unreconciled_transactions: 0,
        data: [],
      };
    }

    const rows = await this.dataSource.query<BankSummaryRow[]>(
      `
      SELECT ba.id, ba.name, ba.bank_name, ba.currency,
             coa.code AS gl_account_code, coa.name AS gl_account_name,
             COALESCE(SUM(CASE WHEN je.id IS NOT NULL THEN jl.debit - jl.credit ELSE 0 END), 0) AS book_balance,
             COUNT(bt.id) FILTER (WHERE bt.status = 'imported')::int AS imported_transactions,
             COUNT(bt.id) FILTER (WHERE bt.status = 'matched')::int AS matched_transactions,
             MAX(br.reconciled_at)::text AS last_reconciled_at
      FROM ${schema}.bank_accounts ba
      JOIN ${schema}.chart_of_accounts coa ON coa.id = ba.gl_account_id
      LEFT JOIN ${schema}.journal_lines jl ON jl.account_id = ba.gl_account_id
      LEFT JOIN ${schema}.journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted'
      LEFT JOIN ${schema}.bank_transactions bt ON bt.bank_account_id = ba.id
      LEFT JOIN ${schema}.bank_reconciliations br
        ON br.bank_account_id = ba.id AND br.status = 'reconciled'
      WHERE ba.is_active = true
      GROUP BY ba.id, ba.name, ba.bank_name, ba.currency, coa.code, coa.name
      ORDER BY ba.name
      `,
    );
    const data = rows.map((row) => ({
      id: row.id,
      name: row.name,
      bank_name: row.bank_name,
      currency: row.currency ?? 'BOB',
      gl_account_code: row.gl_account_code,
      gl_account_name: row.gl_account_name,
      book_balance: this.round2(this.toNumber(row.book_balance)),
      imported_transactions: Number(row.imported_transactions ?? 0),
      matched_transactions: Number(row.matched_transactions ?? 0),
      last_reconciled_at: row.last_reconciled_at,
    }));

    return {
      account_count: data.length,
      total_book_balance: this.round2(
        data.reduce((sum, account) => sum + account.book_balance, 0),
      ),
      unreconciled_transactions: data.reduce(
        (sum, account) => sum + account.imported_transactions,
        0,
      ),
      data,
    };
  }

  private async tableExists(
    schemaName: string,
    tableName: string,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<{ exists: boolean }[]>(
      `
      SELECT EXISTS (
        SELECT 1
        FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = $2
      ) AS exists
      `,
      [schemaName, tableName],
    );
    return Boolean(rows[0]?.exists);
  }

  private toNumber(value: string | number | null | undefined): number {
    if (value === null || value === undefined) return 0;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  private round2(value: number): number {
    return new MoneyDecimal(value)
      .toDecimalPlaces(2, MONEY_ROUNDING)
      .toNumber();
  }
}
