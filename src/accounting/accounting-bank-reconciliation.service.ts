import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import { quoteIdent } from '../common/utils/sql-identifier';

interface BankTransactionMatchRow {
  bank_transaction_id: number;
  bank_amount: string | number;
  bank_status: string;
  matched_journal_line_id: number | null;
  gl_account_id: number;
  journal_line_id: number;
  line_account_id: number;
  debit: string | number;
  credit: string | number;
  account_code: string;
}

export interface BankTransactionReviewRow {
  id: number;
  bank_account_id: number;
  bank_account_name: string;
  bank_name: string | null;
  transaction_date: string;
  description: string;
  amount: number;
  currency: string;
  external_id: string | null;
  status: string;
}

export interface BankMatchCandidateRow {
  journal_line_id: number;
  journal_entry_id: number;
  entry_number: string;
  entry_date: string;
  description: string;
  account_code: string;
  account_name: string;
  debit: number;
  credit: number;
  amount: number;
  days_distance: number;
}

@Injectable()
export class AccountingBankReconciliationService {
  constructor(private readonly dataSource: DataSource) {}

  async getOpenTransactions(
    schemaName: string,
    bankAccountId?: number | null,
    limit = 50,
  ): Promise<BankTransactionReviewRow[]> {
    const schema = quoteIdent(schemaName);
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const rows = await this.dataSource.query<
      Array<Omit<BankTransactionReviewRow, 'amount'> & { amount: string | number }>
    >(
      `
        SELECT
          bt.id,
          bt.bank_account_id,
          ba.name AS bank_account_name,
          ba.bank_name,
          bt.transaction_date::text AS transaction_date,
          bt.description,
          bt.amount,
          bt.currency,
          bt.external_id,
          bt.status
        FROM ${schema}.bank_transactions bt
        INNER JOIN ${schema}.bank_accounts ba ON ba.id = bt.bank_account_id
        WHERE bt.status = 'imported'
          AND ($1::int IS NULL OR bt.bank_account_id = $1)
        ORDER BY bt.transaction_date DESC, bt.id DESC
        LIMIT $2
      `,
      [bankAccountId ?? null, boundedLimit],
    );

    return rows.map((row) => ({
      ...row,
      amount: Number(row.amount),
    }));
  }

  async getMatchCandidates(
    schemaName: string,
    bankTransactionId: number,
    limit = 10,
  ): Promise<BankMatchCandidateRow[]> {
    const schema = quoteIdent(schemaName);
    const boundedLimit = Math.max(1, Math.min(limit, 25));
    const rows = await this.dataSource.query<
      Array<Omit<BankMatchCandidateRow, 'debit' | 'credit' | 'amount' | 'days_distance'> & {
        debit: string | number;
        credit: string | number;
        amount: string | number;
        days_distance: string | number;
      }>
    >(
      `
        WITH target AS (
          SELECT bt.id, bt.transaction_date, bt.amount, ba.gl_account_id
          FROM ${schema}.bank_transactions bt
          INNER JOIN ${schema}.bank_accounts ba ON ba.id = bt.bank_account_id
          WHERE bt.id = $1
            AND bt.status = 'imported'
        )
        SELECT
          jl.id AS journal_line_id,
          je.id AS journal_entry_id,
          je.entry_number,
          je.entry_date::text AS entry_date,
          je.description,
          coa.code AS account_code,
          coa.name AS account_name,
          jl.debit,
          jl.credit,
          ABS(jl.debit - jl.credit)::numeric AS amount,
          ABS(je.entry_date - target.transaction_date)::int AS days_distance
        FROM target
        INNER JOIN ${schema}.journal_lines jl ON jl.account_id = target.gl_account_id
        INNER JOIN ${schema}.journal_entries je ON je.id = jl.journal_entry_id
        INNER JOIN ${schema}.chart_of_accounts coa ON coa.id = jl.account_id
        LEFT JOIN ${schema}.bank_transactions matched
          ON matched.matched_journal_line_id = jl.id
         AND matched.status = 'matched'
        WHERE je.status = 'posted'
          AND matched.id IS NULL
          AND ABS(ABS(jl.debit - jl.credit) - ABS(target.amount)) <= 0.01
          AND ABS(jl.debit - jl.credit) > 0
        ORDER BY days_distance ASC, je.entry_date DESC, je.id DESC
        LIMIT $2
      `,
      [bankTransactionId, boundedLimit],
    );

    return rows.map((row) => ({
      ...row,
      debit: Number(row.debit),
      credit: Number(row.credit),
      amount: Number(row.amount),
      days_distance: Number(row.days_distance),
    }));
  }

  async matchBankTransaction(
    schemaName: string,
    bankTransactionId: number,
    journalLineId: number,
  ): Promise<{ matched: true }> {
    const schema = quoteIdent(schemaName);
    await runTenantTransaction(this.dataSource, async (runner) => {
      const rows = (await runner.query(
        `
          SELECT
            bt.id AS bank_transaction_id,
            bt.amount AS bank_amount,
            bt.status AS bank_status,
            bt.matched_journal_line_id,
            ba.gl_account_id,
            jl.id AS journal_line_id,
            jl.account_id AS line_account_id,
            jl.debit,
            jl.credit,
            coa.code AS account_code
          FROM ${schema}.bank_transactions bt
          INNER JOIN ${schema}.bank_accounts ba ON ba.id = bt.bank_account_id
          CROSS JOIN ${schema}.journal_lines jl
          INNER JOIN ${schema}.chart_of_accounts coa ON coa.id = jl.account_id
          WHERE bt.id = $1
            AND jl.id = $2
          FOR UPDATE OF bt
        `,
        [bankTransactionId, journalLineId],
      )) as BankTransactionMatchRow[];

      const row = rows[0];
      if (!row) {
        throw new NotFoundException(
          'Transaccion bancaria o linea contable no encontrada.',
        );
      }

      if (row.bank_status === 'matched' || row.matched_journal_line_id) {
        throw new BadRequestException('La transaccion bancaria ya fue conciliada.');
      }

      if (row.line_account_id !== row.gl_account_id) {
        throw new BadRequestException(
          'La linea contable no pertenece a la cuenta bancaria seleccionada.',
        );
      }

      const bankAbs = Math.abs(this.toCents(row.bank_amount));
      const lineAbs = Math.abs(this.toCents(Number(row.debit) - Number(row.credit)));
      if (bankAbs !== lineAbs) {
        throw new BadRequestException(
          'El monto bancario no coincide con la linea contable.',
        );
      }

      await runner.query(
        `
          UPDATE ${schema}.bank_transactions
          SET matched_journal_line_id = $1,
              status = 'matched',
              updated_at = NOW()
          WHERE id = $2
        `,
        [journalLineId, bankTransactionId],
      );
    });

    return { matched: true };
  }

  private toCents(value: string | number): number {
    return Math.round(Number(value) * 100);
  }
}
