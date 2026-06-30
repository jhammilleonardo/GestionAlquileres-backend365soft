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
  payment_status: string;
  date: string | Date;
  paid_date: string | Date | null;
  description: string | null;
}

interface ExpensePaymentPostingRow {
  id: number;
  expense_id: number;
  property_id: number;
  unit_id: number | null;
  vendor_id: number | null;
  amount: string | number;
  currency: string;
  category: string;
  payment_date: string | Date;
  payment_method: string | null;
  reference_number: string | null;
  notes: string | null;
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
      description:
        expense.payment_status === 'PENDING'
          ? `Registro de gasto pendiente #${expense.id}`
          : `Posteo de gasto pagado #${expense.id}`,
      sourceModule: 'expenses',
      sourceId: String(expense.id),
      basis: expense.payment_status === 'PENDING' ? 'accrual' : 'cash',
      metadata: {
        expenseId: expense.id,
        category: expense.category,
        paymentStatus: expense.payment_status,
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
          accountCode: expense.payment_status === 'PENDING' ? '2300' : '1100',
          credit: amount,
          propertyId: expense.property_id,
          unitId: expense.unit_id,
          vendorId: expense.vendor_id,
          expenseId: expense.id,
          memo:
            expense.payment_status === 'PENDING'
              ? 'Cuenta por pagar a proveedor'
              : 'Salida de caja/banco',
        },
      ],
    });

    await this.markExpensePosted(schemaName, expense.id, result.id, 'posted');

    return result;
  }

  async postExpensePayment(
    schemaName: string,
    expenseId: number,
  ): Promise<PostedJournalEntry> {
    const expense = await this.findExpense(schemaName, expenseId);
    const amount = Number(expense.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Gasto #${expenseId} tiene monto de pago invalido.`,
      );
    }

    if (
      expense.payment_status !== 'PAID' &&
      expense.payment_status !== 'REIMBURSED'
    ) {
      throw new BadRequestException(
        `Gasto #${expenseId} no esta marcado como pagado.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.toDateOnly(expense.paid_date ?? expense.date),
      description: `Pago de gasto pendiente #${expense.id}`,
      sourceModule: 'expense-payments',
      sourceId: String(expense.id),
      basis: 'cash',
      metadata: {
        expenseId: expense.id,
        category: expense.category,
        paymentStatus: expense.payment_status,
      },
      lines: [
        {
          accountCode: '2300',
          debit: amount,
          propertyId: expense.property_id,
          unitId: expense.unit_id,
          vendorId: expense.vendor_id,
          expenseId: expense.id,
          memo: 'Cancelacion de cuenta por pagar',
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

    await this.markExpensePosted(
      schemaName,
      expense.id,
      result.id,
      'paid_posted',
    );

    return result;
  }

  async postExpenseVendorPayment(
    schemaName: string,
    expensePaymentId: number,
  ): Promise<PostedJournalEntry> {
    const payment = await this.findExpensePayment(schemaName, expensePaymentId);
    const amount = Number(payment.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Pago de gasto #${expensePaymentId} tiene monto invalido.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.toDateOnly(payment.payment_date),
      description: `Pago de proveedor para gasto #${payment.expense_id}`,
      sourceModule: 'expense-payments',
      sourceId: String(payment.id),
      basis: 'cash',
      metadata: {
        expenseId: payment.expense_id,
        expensePaymentId: payment.id,
        category: payment.category,
        paymentMethod: payment.payment_method,
        referenceNumber: payment.reference_number,
      },
      lines: [
        {
          accountCode: '2300',
          debit: amount,
          propertyId: payment.property_id,
          unitId: payment.unit_id,
          vendorId: payment.vendor_id,
          expenseId: payment.expense_id,
          memo: payment.notes ?? 'Abono a cuenta por pagar',
        },
        {
          accountCode: '1100',
          credit: amount,
          propertyId: payment.property_id,
          unitId: payment.unit_id,
          vendorId: payment.vendor_id,
          expenseId: payment.expense_id,
          memo: 'Salida de caja/banco',
        },
      ],
    });

    await this.markExpensePaymentPosted(schemaName, payment.id, result.id);

    return result;
  }

  private async findExpense(
    schemaName: string,
    expenseId: number,
  ): Promise<ExpensePostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<ExpensePostingRow[]>(
      `
        SELECT id, property_id, unit_id, vendor_id, amount, category,
               payment_status, date, paid_date, description
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
    accountingStatus: string,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.expenses
        SET accounting_status = $1,
            journal_entry_id = $2,
            updated_at = NOW()
        WHERE id = $3
      `,
      [accountingStatus, journalEntryId, expenseId],
    );
  }

  private async findExpensePayment(
    schemaName: string,
    expensePaymentId: number,
  ): Promise<ExpensePaymentPostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<ExpensePaymentPostingRow[]>(
      `
        SELECT
          ep.id,
          ep.expense_id,
          e.property_id,
          e.unit_id,
          e.vendor_id,
          ep.amount,
          ep.currency,
          e.category,
          ep.payment_date,
          ep.payment_method,
          ep.reference_number,
          ep.notes
        FROM ${schema}.expense_payments ep
        INNER JOIN ${schema}.expenses e ON e.id = ep.expense_id
        WHERE ep.id = $1
        LIMIT 1
      `,
      [expensePaymentId],
    );
    const payment = rows[0];

    if (!payment) {
      throw new BadRequestException(
        `Pago de gasto #${expensePaymentId} no encontrado para posteo contable.`,
      );
    }

    return payment;
  }

  private async markExpensePaymentPosted(
    schemaName: string,
    expensePaymentId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.expense_payments
        SET accounting_status = 'posted',
            journal_entry_id = $1
        WHERE id = $2
      `,
      [journalEntryId, expensePaymentId],
    );
  }

  private expenseAccountForCategory(category: string): string {
    switch (category) {
      case 'MAINTENANCE':
      case 'REPAIRS':
        return '5200';
      case 'CLEANING':
      case 'LAUNDRY':
      case 'SUPPLIES':
        return '5300';
      case 'INSURANCE':
      case 'TAX':
      case 'LEGAL':
        return '5400';
      case 'PLATFORM_FEE':
      case 'BANK_FEE':
      case 'MANAGEMENT_FEE':
        return '5000';
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
