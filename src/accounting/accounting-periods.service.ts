import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

type AccountingPeriodStatus = 'open' | 'closed';

interface AccountingPeriodRow {
  id: number | string;
  period_year: number | string;
  period_month: number | string;
  status: AccountingPeriodStatus;
  closed_at: Date | string | null;
  closed_by: number | string | null;
  reopened_at: Date | string | null;
  reopened_by: number | string | null;
  reopen_reason: string | null;
}

export interface AccountingPeriodState {
  id: number;
  year: number;
  month: number;
  status: AccountingPeriodStatus;
  closedAt: Date | string | null;
  closedBy: number | null;
  reopenedAt: Date | string | null;
  reopenedBy: number | null;
  reopenReason: string | null;
}

@Injectable()
export class AccountingPeriodsService {
  constructor(private readonly dataSource: DataSource) {}

  async assertPeriodOpen(
    schemaName: string,
    entryDate: string,
    queryRunner?: QueryRunner,
  ): Promise<void> {
    const { year, month } = this.parseAccountingDate(entryDate);
    const period = await this.findPeriod(schemaName, year, month, queryRunner);

    if (period?.status === 'closed') {
      throw new ConflictException(
        `El periodo contable ${year}-${String(month).padStart(2, '0')} esta cerrado. Registre una reversa o ajuste en un periodo abierto.`,
      );
    }
  }

  async closePeriod(
    schemaName: string,
    year: number,
    month: number,
    closedBy?: number | null,
  ): Promise<AccountingPeriodState> {
    this.validateYearMonth(year, month);
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<AccountingPeriodRow[]>(
      `
        INSERT INTO ${schema}.accounting_periods
          (period_year, period_month, status, closed_at, closed_by, updated_at)
        VALUES ($1, $2, 'closed', NOW(), $3, NOW())
        ON CONFLICT (period_year, period_month) DO UPDATE SET
          status = 'closed',
          closed_at = COALESCE(${schema}.accounting_periods.closed_at, NOW()),
          closed_by = COALESCE(${schema}.accounting_periods.closed_by, EXCLUDED.closed_by),
          updated_at = NOW()
        RETURNING id, period_year, period_month, status, closed_at, closed_by,
                  reopened_at, reopened_by, reopen_reason
      `,
      [year, month, closedBy ?? null],
    );

    return this.toState(rows[0]);
  }

  async reopenPeriod(
    schemaName: string,
    year: number,
    month: number,
    reopenedBy: number,
    reason: string,
  ): Promise<AccountingPeriodState> {
    this.validateYearMonth(year, month);
    const trimmedReason = reason.trim();

    if (!trimmedReason) {
      throw new BadRequestException(
        'Debe indicar el motivo para reabrir un periodo contable.',
      );
    }

    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<AccountingPeriodRow[]>(
      `
        INSERT INTO ${schema}.accounting_periods
          (period_year, period_month, status, reopened_at, reopened_by, reopen_reason, updated_at)
        VALUES ($1, $2, 'open', NOW(), $3, $4, NOW())
        ON CONFLICT (period_year, period_month) DO UPDATE SET
          status = 'open',
          reopened_at = NOW(),
          reopened_by = EXCLUDED.reopened_by,
          reopen_reason = EXCLUDED.reopen_reason,
          updated_at = NOW()
        RETURNING id, period_year, period_month, status, closed_at, closed_by,
                  reopened_at, reopened_by, reopen_reason
      `,
      [year, month, reopenedBy, trimmedReason],
    );

    return this.toState(rows[0]);
  }

  async getPeriod(
    schemaName: string,
    year: number,
    month: number,
  ): Promise<AccountingPeriodState | null> {
    this.validateYearMonth(year, month);
    const period = await this.findPeriod(schemaName, year, month);

    return period ? this.toState(period) : null;
  }

  private async findPeriod(
    schemaName: string,
    year: number,
    month: number,
    queryRunner?: QueryRunner,
  ): Promise<AccountingPeriodRow | null> {
    const schema = quoteIdent(schemaName);
    const sql = `
        SELECT id, period_year, period_month, status, closed_at, closed_by,
               reopened_at, reopened_by, reopen_reason
        FROM ${schema}.accounting_periods
        WHERE period_year = $1 AND period_month = $2
        LIMIT 1
      `;
    const params = [year, month];
    const rows: unknown = queryRunner
      ? await queryRunner.query(sql, params)
      : await this.dataSource.query<AccountingPeriodRow[]>(sql, params);

    return this.firstAccountingPeriodRow(rows);
  }

  private firstAccountingPeriodRow(rows: unknown): AccountingPeriodRow | null {
    if (!Array.isArray(rows)) {
      return null;
    }

    const first = rows[0] as AccountingPeriodRow | undefined;
    return first ?? null;
  }

  private parseAccountingDate(entryDate: string): {
    year: number;
    month: number;
  } {
    const match = /^(\d{4})-(\d{2})-\d{2}$/.exec(entryDate);

    if (!match) {
      throw new BadRequestException('entryDate debe tener formato YYYY-MM-DD.');
    }

    const year = Number(match[1]);
    const month = Number(match[2]);
    this.validateYearMonth(year, month);

    return { year, month };
  }

  private validateYearMonth(year: number, month: number): void {
    if (!Number.isInteger(year) || year < 2000 || year > 2100) {
      throw new BadRequestException('period_year invalido.');
    }

    if (!Number.isInteger(month) || month < 1 || month > 12) {
      throw new BadRequestException('period_month invalido.');
    }
  }

  private toState(row: AccountingPeriodRow | undefined): AccountingPeriodState {
    if (!row) {
      throw new BadRequestException('Periodo contable no encontrado.');
    }

    return {
      id: Number(row.id),
      year: Number(row.period_year),
      month: Number(row.period_month),
      status: row.status,
      closedAt: row.closed_at,
      closedBy: row.closed_by === null ? null : Number(row.closed_by),
      reopenedAt: row.reopened_at,
      reopenedBy: row.reopened_by === null ? null : Number(row.reopened_by),
      reopenReason: row.reopen_reason,
    };
  }
}
