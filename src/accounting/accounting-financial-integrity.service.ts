import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AccountingOutboxProcessor } from './accounting-outbox.processor';
import { AccountingOutboxService } from './accounting-outbox.service';

export type FinancialIntegritySeverity = 'error' | 'warning';

export interface FinancialIntegrityIssue {
  code: string;
  severity: FinancialIntegritySeverity;
  description: string;
  count: number;
  sample: Record<string, unknown>[];
}

export interface FinancialIntegrityReport {
  generated_at: string;
  ok: boolean;
  issue_count: number;
  issues: FinancialIntegrityIssue[];
}

export interface FinancialIntegrityRemediationResult {
  generated_at: string;
  enqueued_payments: number;
  enqueued_expenses: number;
  enqueued_expense_payments: number;
  processed_events: number;
  report: FinancialIntegrityReport;
}

@Injectable()
export class AccountingFinancialIntegrityService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingOutboxService: AccountingOutboxService,
    private readonly accountingOutboxProcessor: AccountingOutboxProcessor,
  ) {}

  async getReport(schemaName: string): Promise<FinancialIntegrityReport> {
    const schema = quoteIdent(schemaName);
    const [
      unpostedPayments,
      invalidPaymentLinks,
      overpaidReservations,
      invalidExpenseBalances,
      unpostedExpenses,
      unpostedExpensePayments,
      unbalancedEntries,
    ] = await Promise.all([
      this.findUnpostedApprovedPayments(schema),
      this.findInvalidPaymentLinks(schema),
      this.findOverpaidReservations(schema),
      this.findInvalidExpenseBalances(schema),
      this.findUnpostedExpenses(schema),
      this.findUnpostedExpensePayments(schema),
      this.findUnbalancedJournalEntries(schema),
    ]);

    const issues = [
      this.issue(
        'approved_payments_not_posted',
        'error',
        'Pagos aprobados que todavía no llegaron al libro diario.',
        unpostedPayments,
      ),
      this.issue(
        'invalid_payment_link',
        'error',
        'Pagos que no apuntan exactamente a un contrato o una reserva.',
        invalidPaymentLinks,
      ),
      this.issue(
        'overpaid_reservations',
        'warning',
        'Reservas cuyo neto aprobado supera el total reservado.',
        overpaidReservations,
      ),
      this.issue(
        'invalid_expense_balances',
        'error',
        'Gastos con monto pagado negativo o mayor al total del gasto.',
        invalidExpenseBalances,
      ),
      this.issue(
        'expenses_not_posted',
        'warning',
        'Gastos base que todavía no fueron posteados contablemente.',
        unpostedExpenses,
      ),
      this.issue(
        'expense_payments_not_posted',
        'warning',
        'Pagos parciales o abonos a proveedores que todavía no fueron posteados.',
        unpostedExpensePayments,
      ),
      this.issue(
        'unbalanced_journal_entries',
        'error',
        'Asientos contables donde débitos y créditos no cuadran.',
        unbalancedEntries,
      ),
    ].filter((item): item is FinancialIntegrityIssue => item.count > 0);

    return {
      generated_at: new Date().toISOString(),
      ok: issues.length === 0,
      issue_count: issues.reduce((sum, item) => sum + item.count, 0),
      issues,
    };
  }

  async reprocessApprovedPaymentPostings(
    schemaName: string,
    limit = 50,
  ): Promise<FinancialIntegrityRemediationResult> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const payments = await this.findUnpostedApprovedPaymentsForRemediation(
      schemaName,
      boundedLimit,
    );

    for (const payment of payments) {
      await this.accountingOutboxService.enqueue({
        schemaName,
        eventType: 'payment.approved',
        aggregateType: 'payment',
        aggregateId: String(payment.id),
        payload: {
          paymentId: payment.id,
          remediation: 'financial_integrity',
        },
      });
    }

    const processedEvents =
      await this.accountingOutboxProcessor.processPendingForSchema(
        schemaName,
        boundedLimit,
      );

    return {
      generated_at: new Date().toISOString(),
      enqueued_payments: payments.length,
      enqueued_expenses: 0,
      enqueued_expense_payments: 0,
      processed_events: processedEvents,
      report: await this.getReport(schemaName),
    };
  }

  async reprocessExpensePostings(
    schemaName: string,
    limit = 50,
  ): Promise<FinancialIntegrityRemediationResult> {
    const boundedLimit = Math.max(1, Math.min(limit, 100));
    const [expenses, expensePayments] = await Promise.all([
      this.findUnpostedExpensesForRemediation(schemaName, boundedLimit),
      this.findUnpostedExpensePaymentsForRemediation(schemaName, boundedLimit),
    ]);

    for (const expense of expenses) {
      await this.accountingOutboxService.enqueue({
        schemaName,
        eventType: 'expense.created',
        aggregateType: 'expense',
        aggregateId: String(expense.id),
        payload: {
          expenseId: expense.id,
          remediation: 'financial_integrity',
        },
      });
    }

    for (const payment of expensePayments) {
      await this.accountingOutboxService.enqueue({
        schemaName,
        eventType: 'expense.payment.created',
        aggregateType: 'expense',
        aggregateId: String(payment.expense_id),
        payload: {
          expenseId: payment.expense_id,
          expensePaymentId: payment.id,
          remediation: 'financial_integrity',
        },
      });
    }

    const processedEvents =
      await this.accountingOutboxProcessor.processPendingForSchema(
        schemaName,
        boundedLimit * 2,
      );

    return {
      generated_at: new Date().toISOString(),
      enqueued_payments: 0,
      enqueued_expenses: expenses.length,
      enqueued_expense_payments: expensePayments.length,
      processed_events: processedEvents,
      report: await this.getReport(schemaName),
    };
  }

  private findUnpostedApprovedPayments(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, contract_id, reservation_id, property_id, amount, currency,
              accounting_status, journal_entry_id
         FROM ${schema}.payments
        WHERE status = 'APPROVED'
          AND COALESCE(accounting_status, 'not_posted') <> 'posted'
        ORDER BY payment_date DESC, id DESC
        LIMIT 50`,
    );
  }

  private findUnpostedApprovedPaymentsForRemediation(
    schemaName: string,
    limit: number,
  ): Promise<Array<{ id: number }>> {
    const schema = quoteIdent(schemaName);
    return this.dataSource.query(
      `SELECT id
         FROM ${schema}.payments
        WHERE status = 'APPROVED'
          AND COALESCE(accounting_status, 'not_posted') <> 'posted'
        ORDER BY payment_date ASC, id ASC
        LIMIT $1`,
      [limit],
    );
  }

  private findInvalidPaymentLinks(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, contract_id, reservation_id, amount, currency, status
         FROM ${schema}.payments
        WHERE (
          CASE WHEN contract_id IS NOT NULL THEN 1 ELSE 0 END +
          CASE WHEN reservation_id IS NOT NULL THEN 1 ELSE 0 END
        ) <> 1
        ORDER BY id DESC
        LIMIT 50`,
    );
  }

  private findOverpaidReservations(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT r.id AS reservation_id,
              r.total_amount,
              r.currency,
              COALESCE(SUM(GREATEST(p.amount - COALESCE(ref.total_refunded, 0), 0))
                FILTER (WHERE p.status = 'APPROVED'), 0)::numeric AS net_paid
         FROM ${schema}.reservations r
         LEFT JOIN ${schema}.payments p ON p.reservation_id = r.id
         LEFT JOIN LATERAL (
           SELECT COALESCE(SUM(amount), 0)::numeric AS total_refunded
             FROM ${schema}.payment_refunds
            WHERE payment_id = p.id
         ) ref ON true
        GROUP BY r.id, r.total_amount, r.currency
       HAVING COALESCE(SUM(GREATEST(p.amount - COALESCE(ref.total_refunded, 0), 0))
                FILTER (WHERE p.status = 'APPROVED'), 0) > r.total_amount + 0.01
        ORDER BY r.id DESC
        LIMIT 50`,
    );
  }

  private findInvalidExpenseBalances(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT id, property_id, vendor_id, amount, paid_amount, currency,
              payment_status
         FROM ${schema}.expenses
        WHERE paid_amount < 0
           OR paid_amount > amount + 0.01
        ORDER BY id DESC
        LIMIT 50`,
    );
  }

  private findUnpostedExpenses(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT e.id, e.property_id, e.vendor_id, e.amount, e.paid_amount,
              e.currency, e.payment_status, e.accounting_status,
              e.journal_entry_id
         FROM ${schema}.expenses
        WHERE e.payment_status IN ('PAID', 'REIMBURSED', 'PENDING', 'PARTIALLY_PAID')
          AND NOT EXISTS (
            SELECT 1
              FROM ${schema}.journal_entries je
             WHERE je.source_module = 'expenses'
               AND je.source_id = e.id::text
               AND je.status = 'posted'
          )
        ORDER BY e.date DESC, e.id DESC
        LIMIT 50`,
    );
  }

  private findUnpostedExpensePayments(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT ep.id, ep.expense_id, ep.amount, ep.currency,
              ep.payment_date, ep.accounting_status, ep.journal_entry_id
         FROM ${schema}.expense_payments ep
        WHERE COALESCE(ep.accounting_status, 'pending_posting') <> 'posted'
        ORDER BY ep.payment_date DESC, ep.id DESC
        LIMIT 50`,
    );
  }

  private findUnpostedExpensesForRemediation(
    schemaName: string,
    limit: number,
  ): Promise<Array<{ id: number }>> {
    const schema = quoteIdent(schemaName);
    return this.dataSource.query(
      `SELECT e.id
         FROM ${schema}.expenses e
        WHERE e.payment_status IN ('PAID', 'REIMBURSED', 'PENDING', 'PARTIALLY_PAID')
          AND NOT EXISTS (
            SELECT 1
              FROM ${schema}.journal_entries je
             WHERE je.source_module = 'expenses'
               AND je.source_id = e.id::text
               AND je.status = 'posted'
          )
        ORDER BY e.date ASC, e.id ASC
        LIMIT $1`,
      [limit],
    );
  }

  private findUnpostedExpensePaymentsForRemediation(
    schemaName: string,
    limit: number,
  ): Promise<Array<{ id: number; expense_id: number }>> {
    const schema = quoteIdent(schemaName);
    return this.dataSource.query(
      `SELECT id, expense_id
         FROM ${schema}.expense_payments
        WHERE COALESCE(accounting_status, 'pending_posting') <> 'posted'
        ORDER BY payment_date ASC, id ASC
        LIMIT $1`,
      [limit],
    );
  }

  private findUnbalancedJournalEntries(
    schema: string,
  ): Promise<Record<string, unknown>[]> {
    return this.dataSource.query(
      `SELECT je.id,
              je.entry_number,
              COALESCE(SUM(jl.debit), 0)::numeric AS total_debit,
              COALESCE(SUM(jl.credit), 0)::numeric AS total_credit,
              ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0))::numeric AS difference
         FROM ${schema}.journal_entries je
         LEFT JOIN ${schema}.journal_lines jl ON jl.journal_entry_id = je.id
        GROUP BY je.id, je.entry_number
       HAVING ABS(COALESCE(SUM(jl.debit), 0) - COALESCE(SUM(jl.credit), 0)) > 0.01
        ORDER BY je.id DESC
        LIMIT 50`,
    );
  }

  private issue(
    code: string,
    severity: FinancialIntegritySeverity,
    description: string,
    sample: Record<string, unknown>[],
  ): FinancialIntegrityIssue {
    return {
      code,
      severity,
      description,
      count: sample.length,
      sample,
    };
  }
}
