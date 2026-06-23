import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AccountingLedgerService } from './accounting-ledger.service';
import { PostedJournalEntry } from './accounting.types';

interface ExpensePostingRow {
  id: number;
  property_id: number;
  unit_id: number | null;
  vendor_id: number | null;
  amount: string | number;
  category: string;
  date: string | Date;
  description: string | null;
}

@Injectable()
export class AccountingExpensePostingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingLedgerService: AccountingLedgerService,
  ) {}

  async postExpense(
    schemaName: string,
    expenseId: number,
  ): Promise<PostedJournalEntry> {
    const expense = await this.findExpense(schemaName, expenseId);
    const amount = Number(expense.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Gasto #${expenseId} tiene monto contable invalido.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.toDateOnly(expense.date),
      description: `Posteo de gasto #${expense.id}`,
      sourceModule: 'expenses',
      sourceId: String(expense.id),
      basis: 'cash',
      metadata: {
        expenseId: expense.id,
        category: expense.category,
      },
      lines: [
        {
          accountCode: this.expenseAccountForCategory(expense.category),
          debit: amount,
          propertyId: expense.property_id,
          unitId: expense.unit_id,
          vendorId: expense.vendor_id,
          expenseId: expense.id,
          memo: expense.description ?? `Gasto ${expense.category}`,
        },
        {
          accountCode: '1100',
          credit: amount,
          propertyId: expense.property_id,
          unitId: expense.unit_id,
          vendorId: expense.vendor_id,
          expenseId: expense.id,
          memo: 'Salida de caja/banco',
        },
      ],
    });

    await this.markExpensePosted(schemaName, expense.id, result.id);

    return result;
  }

  private async findExpense(
    schemaName: string,
    expenseId: number,
  ): Promise<ExpensePostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<ExpensePostingRow[]>(
      `
        SELECT id, property_id, unit_id, vendor_id, amount, category, date, description
        FROM ${schema}.expenses
        WHERE id = $1
        LIMIT 1
      `,
      [expenseId],
    );
    const expense = rows[0];

    if (!expense) {
      throw new BadRequestException(
        `Gasto #${expenseId} no encontrado para posteo contable.`,
      );
    }

    return expense;
  }

  private async markExpensePosted(
    schemaName: string,
    expenseId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.expenses
        SET accounting_status = 'posted',
            journal_entry_id = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [journalEntryId, expenseId],
    );
  }

  private expenseAccountForCategory(category: string): string {
    switch (category) {
      case 'MAINTENANCE':
        return '5200';
      case 'CLEANING':
        return '5300';
      case 'INSURANCE':
      case 'TAX':
        return '5400';
      default:
        return '5000';
    }
  }

  private toDateOnly(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
  }
}
