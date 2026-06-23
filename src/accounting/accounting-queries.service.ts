import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import {
  ChartOfAccountsQueryDto,
  JournalEntriesQueryDto,
} from './dto/accounting-query.dto';

export interface ChartAccount {
  id: number;
  code: string;
  name: string;
  type: string;
  parent_id: number | null;
  is_system: boolean;
  is_active: boolean;
}

export interface JournalLineView {
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  memo: string | null;
}

export interface JournalEntryView {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  source_module: string | null;
  source_id: string | null;
  status: string;
  basis: string;
  lines: JournalLineView[];
}

export interface PaginatedJournalEntries {
  data: JournalEntryView[];
  total: number;
  limit: number;
  offset: number;
}

/** Lecturas crudas del libro contable (plan de cuentas y asientos). */
@Injectable()
export class AccountingQueriesService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async getChartOfAccounts(
    tenantSlug: string,
    filter: ChartOfAccountsQueryDto = {},
  ): Promise<ChartAccount[]> {
    const schema = await this.schema(tenantSlug);

    return this.dataSource.query<ChartAccount[]>(
      `
      SELECT id, code, name, type, parent_id, is_system, is_active
      FROM ${schema}.chart_of_accounts
      WHERE ($1::text IS NULL OR type = $1)
        AND ($2::boolean IS NULL OR is_active = $2)
      ORDER BY code
      `,
      [filter.type ?? null, filter.isActive ?? null],
    );
  }

  async getJournalEntries(
    tenantSlug: string,
    filter: JournalEntriesQueryDto = {},
  ): Promise<PaginatedJournalEntries> {
    const schema = await this.schema(tenantSlug);
    const status = filter.status ?? 'posted';
    const limit = filter.limit ?? 50;
    const offset = filter.offset ?? 0;
    const params = [
      status,
      filter.from ?? null,
      filter.to ?? null,
      filter.sourceModule ?? null,
    ];

    const where = `
      WHERE e.status = $1
        AND ($2::date IS NULL OR e.entry_date >= $2)
        AND ($3::date IS NULL OR e.entry_date <= $3)
        AND ($4::text IS NULL OR e.source_module = $4)
    `;

    const totalRows = await this.dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::int AS total FROM ${schema}.journal_entries e ${where}`,
      params,
    );
    const total = Number(totalRows[0]?.total ?? 0);

    const rows = await this.dataSource.query<RawJournalEntryRow[]>(
      `
      SELECT
        e.id, e.entry_number, e.entry_date, e.description,
        e.source_module, e.source_id, e.status, e.basis,
        COALESCE(
          json_agg(
            json_build_object(
              'account_code', a.code,
              'account_name', a.name,
              'debit', l.debit,
              'credit', l.credit,
              'memo', l.memo
            ) ORDER BY l.id
          ) FILTER (WHERE l.id IS NOT NULL),
          '[]'
        ) AS lines
      FROM ${schema}.journal_entries e
      LEFT JOIN ${schema}.journal_lines l ON l.journal_entry_id = e.id
      LEFT JOIN ${schema}.chart_of_accounts a ON a.id = l.account_id
      ${where}
      GROUP BY e.id
      ORDER BY e.entry_date DESC, e.id DESC
      LIMIT $5 OFFSET $6
      `,
      [...params, limit, offset],
    );

    return {
      data: rows.map((row) => this.mapEntry(row)),
      total,
      limit,
      offset,
    };
  }

  private mapEntry(row: RawJournalEntryRow): JournalEntryView {
    return {
      id: row.id,
      entry_number: row.entry_number,
      entry_date: row.entry_date,
      description: row.description,
      source_module: row.source_module,
      source_id: row.source_id,
      status: row.status,
      basis: row.basis,
      lines: (row.lines ?? []).map((line) => ({
        account_code: line.account_code,
        account_name: line.account_name,
        debit: Number(line.debit),
        credit: Number(line.credit),
        memo: line.memo,
      })),
    };
  }

  private async schema(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return quoteIdent(tenant.schema_name);
  }
}

interface RawJournalLine {
  account_code: string;
  account_name: string;
  debit: string | number;
  credit: string | number;
  memo: string | null;
}

interface RawJournalEntryRow {
  id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  source_module: string | null;
  source_id: string | null;
  status: string;
  basis: string;
  lines: RawJournalLine[] | null;
}
