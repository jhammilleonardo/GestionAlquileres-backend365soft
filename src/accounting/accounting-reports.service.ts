import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import {
  AsOfQueryDto,
  DateRangeQueryDto,
  GeneralLedgerQueryDto,
} from './dto/accounting-query.dto';

/** Cuentas de saldo deudor por naturaleza (el resto son de saldo acreedor). */
const DEBIT_NORMAL_TYPES = new Set(['asset', 'expense']);

function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

export interface TrialBalanceRow {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
}

export interface TrialBalance {
  from: string | null;
  to: string | null;
  rows: TrialBalanceRow[];
  total_debit: number;
  total_credit: number;
  balanced: boolean;
}

export interface LedgerLine {
  entry_number: string;
  entry_date: string;
  description: string;
  debit: number;
  credit: number;
  memo: string | null;
  balance: number;
}

export interface GeneralLedger {
  account_code: string;
  account_name: string;
  account_type: string;
  opening_balance: number;
  closing_balance: number;
  lines: LedgerLine[];
}

export interface StatementLine {
  code: string;
  name: string;
  amount: number;
}

export interface BalanceSheet {
  as_of: string;
  assets: StatementLine[];
  liabilities: StatementLine[];
  equity: StatementLine[];
  total_assets: number;
  total_liabilities: number;
  total_equity: number;
  net_income: number;
  balanced: boolean;
}

export interface IncomeStatement {
  from: string | null;
  to: string | null;
  income: StatementLine[];
  expenses: StatementLine[];
  total_income: number;
  total_expenses: number;
  net_income: number;
}

interface TypeSumRow {
  code: string;
  name: string;
  type: string;
  debit: string | number;
  credit: string | number;
}

/**
 * Reportes contables calculados desde el ledger (solo asientos `posted`).
 * Convención de signo: cuentas de activo/gasto son de saldo deudor; pasivo,
 * patrimonio e ingreso son de saldo acreedor.
 */
@Injectable()
export class AccountingReportsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async getTrialBalance(
    tenantSlug: string,
    range: DateRangeQueryDto = {},
  ): Promise<TrialBalance> {
    const schema = await this.schema(tenantSlug);
    const rows = await this.dataSource.query<TypeSumRow[]>(
      `
      SELECT a.code, a.name, a.type,
        COALESCE(SUM(l.debit), 0) AS debit,
        COALESCE(SUM(l.credit), 0) AS credit
      FROM ${schema}.chart_of_accounts a
      LEFT JOIN ${schema}.journal_lines l ON l.account_id = a.id
      LEFT JOIN ${schema}.journal_entries e ON e.id = l.journal_entry_id
        AND e.status = 'posted'
        AND ($1::date IS NULL OR e.entry_date >= $1)
        AND ($2::date IS NULL OR e.entry_date <= $2)
      GROUP BY a.id, a.code, a.name, a.type
      HAVING COALESCE(SUM(l.debit), 0) <> 0 OR COALESCE(SUM(l.credit), 0) <> 0
      ORDER BY a.code
      `,
      [range.from ?? null, range.to ?? null],
    );

    let totalDebit = 0;
    let totalCredit = 0;
    const trialRows = rows.map((row) => {
      const net = Number(row.debit) - Number(row.credit);
      const debit = net > 0 ? round2(net) : 0;
      const credit = net < 0 ? round2(-net) : 0;
      totalDebit += debit;
      totalCredit += credit;
      return { code: row.code, name: row.name, type: row.type, debit, credit };
    });

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      rows: trialRows,
      total_debit: round2(totalDebit),
      total_credit: round2(totalCredit),
      balanced: round2(totalDebit) === round2(totalCredit),
    };
  }

  async getGeneralLedger(
    tenantSlug: string,
    query: GeneralLedgerQueryDto,
  ): Promise<GeneralLedger> {
    const schema = await this.schema(tenantSlug);

    const accountRows = await this.dataSource.query<
      { id: number; code: string; name: string; type: string }[]
    >(
      `SELECT id, code, name, type FROM ${schema}.chart_of_accounts WHERE code = $1`,
      [query.accountCode],
    );
    const account = accountRows[0];
    if (!account) {
      return {
        account_code: query.accountCode,
        account_name: '',
        account_type: '',
        opening_balance: 0,
        closing_balance: 0,
        lines: [],
      };
    }

    const sign = DEBIT_NORMAL_TYPES.has(account.type) ? 1 : -1;

    // Saldo de apertura: neto de movimientos anteriores al `from` (si se indicó).
    const openingRows = query.from
      ? await this.dataSource.query<{ debit: string; credit: string }[]>(
          `
          SELECT COALESCE(SUM(l.debit), 0) AS debit, COALESCE(SUM(l.credit), 0) AS credit
          FROM ${schema}.journal_lines l
          JOIN ${schema}.journal_entries e ON e.id = l.journal_entry_id
          WHERE l.account_id = $1 AND e.status = 'posted' AND e.entry_date < $2
          `,
          [account.id, query.from],
        )
      : [{ debit: '0', credit: '0' }];
    let balance = round2(
      sign * (Number(openingRows[0].debit) - Number(openingRows[0].credit)),
    );
    const openingBalance = balance;

    const movementRows = await this.dataSource.query<
      {
        entry_number: string;
        entry_date: string;
        description: string;
        debit: string;
        credit: string;
        memo: string | null;
      }[]
    >(
      `
      SELECT e.entry_number, e.entry_date, e.description, l.debit, l.credit, l.memo
      FROM ${schema}.journal_lines l
      JOIN ${schema}.journal_entries e ON e.id = l.journal_entry_id
      WHERE l.account_id = $1 AND e.status = 'posted'
        AND ($2::date IS NULL OR e.entry_date >= $2)
        AND ($3::date IS NULL OR e.entry_date <= $3)
      ORDER BY e.entry_date, e.id
      `,
      [account.id, query.from ?? null, query.to ?? null],
    );

    const lines = movementRows.map((row) => {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      balance = round2(balance + sign * (debit - credit));
      return {
        entry_number: row.entry_number,
        entry_date: row.entry_date,
        description: row.description,
        debit,
        credit,
        memo: row.memo,
        balance,
      };
    });

    return {
      account_code: account.code,
      account_name: account.name,
      account_type: account.type,
      opening_balance: openingBalance,
      closing_balance: balance,
      lines,
    };
  }

  async getBalanceSheet(
    tenantSlug: string,
    query: AsOfQueryDto = {},
  ): Promise<BalanceSheet> {
    const schema = await this.schema(tenantSlug);
    const asOf = query.asOf ?? new Date().toISOString().slice(0, 10);
    const rows = await this.balancesByAccount(schema, null, asOf);

    const assets: StatementLine[] = [];
    const liabilities: StatementLine[] = [];
    const equity: StatementLine[] = [];
    let totalAssets = 0;
    let totalLiabilities = 0;
    let totalEquity = 0;
    let netIncome = 0;

    for (const row of rows) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      if (row.type === 'asset') {
        const amount = round2(debit - credit);
        assets.push({ code: row.code, name: row.name, amount });
        totalAssets += amount;
      } else if (row.type === 'liability') {
        const amount = round2(credit - debit);
        liabilities.push({ code: row.code, name: row.name, amount });
        totalLiabilities += amount;
      } else if (row.type === 'equity') {
        const amount = round2(credit - debit);
        equity.push({ code: row.code, name: row.name, amount });
        totalEquity += amount;
      } else if (row.type === 'income') {
        netIncome += credit - debit;
      } else if (row.type === 'expense') {
        netIncome -= debit - credit;
      }
    }

    netIncome = round2(netIncome);
    // El resultado del ejercicio se acumula en patrimonio (utilidades retenidas).
    const totalEquityWithIncome = round2(totalEquity + netIncome);
    if (netIncome !== 0) {
      equity.push({
        code: '3900',
        name: 'Resultado del ejercicio',
        amount: netIncome,
      });
    }

    return {
      as_of: asOf,
      assets,
      liabilities,
      equity,
      total_assets: round2(totalAssets),
      total_liabilities: round2(totalLiabilities),
      total_equity: totalEquityWithIncome,
      net_income: netIncome,
      balanced:
        round2(totalAssets) ===
        round2(totalLiabilities + totalEquityWithIncome),
    };
  }

  async getIncomeStatement(
    tenantSlug: string,
    range: DateRangeQueryDto = {},
  ): Promise<IncomeStatement> {
    const schema = await this.schema(tenantSlug);
    const rows = await this.balancesByAccount(
      schema,
      range.from ?? null,
      range.to ?? null,
    );

    const income: StatementLine[] = [];
    const expenses: StatementLine[] = [];
    let totalIncome = 0;
    let totalExpenses = 0;

    for (const row of rows) {
      const debit = Number(row.debit);
      const credit = Number(row.credit);
      if (row.type === 'income') {
        const amount = round2(credit - debit);
        income.push({ code: row.code, name: row.name, amount });
        totalIncome += amount;
      } else if (row.type === 'expense') {
        const amount = round2(debit - credit);
        expenses.push({ code: row.code, name: row.name, amount });
        totalExpenses += amount;
      }
    }

    return {
      from: range.from ?? null,
      to: range.to ?? null,
      income,
      expenses,
      total_income: round2(totalIncome),
      total_expenses: round2(totalExpenses),
      net_income: round2(totalIncome - totalExpenses),
    };
  }

  /** Sumas de débito/crédito por cuenta sobre asientos posteados en el rango. */
  private balancesByAccount(
    schema: string,
    from: string | null,
    to: string | null,
  ): Promise<TypeSumRow[]> {
    return this.dataSource.query<TypeSumRow[]>(
      `
      SELECT a.code, a.name, a.type,
        COALESCE(SUM(l.debit), 0) AS debit,
        COALESCE(SUM(l.credit), 0) AS credit
      FROM ${schema}.chart_of_accounts a
      LEFT JOIN ${schema}.journal_lines l ON l.account_id = a.id
      LEFT JOIN ${schema}.journal_entries e ON e.id = l.journal_entry_id
        AND e.status = 'posted'
        AND ($1::date IS NULL OR e.entry_date >= $1)
        AND ($2::date IS NULL OR e.entry_date <= $2)
      GROUP BY a.id, a.code, a.name, a.type
      HAVING COALESCE(SUM(l.debit), 0) <> 0 OR COALESCE(SUM(l.credit), 0) <> 0
      ORDER BY a.code
      `,
      [from, to],
    );
  }

  private async schema(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return quoteIdent(tenant.schema_name);
  }
}
