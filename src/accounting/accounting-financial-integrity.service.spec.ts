import { DataSource } from 'typeorm';
import { AccountingOutboxProcessor } from './accounting-outbox.processor';
import { AccountingOutboxService } from './accounting-outbox.service';
import { AccountingFinancialIntegrityService } from './accounting-financial-integrity.service';

describe('AccountingFinancialIntegrityService', () => {
  let dataSource: { query: jest.Mock };
  let outboxService: { enqueue: jest.Mock };
  let outboxProcessor: { processPendingForSchema: jest.Mock };
  let service: AccountingFinancialIntegrityService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    outboxService = { enqueue: jest.fn().mockResolvedValue(undefined) };
    outboxProcessor = {
      processPendingForSchema: jest.fn().mockResolvedValue(2),
    };
    service = new AccountingFinancialIntegrityService(
      dataSource as unknown as DataSource,
      outboxService as unknown as AccountingOutboxService,
      outboxProcessor as unknown as AccountingOutboxProcessor,
    );
  });

  it('returns ok when no financial integrity issues are found', async () => {
    dataSource.query.mockResolvedValue([]);

    const report = await service.getReport('tenant_alpha');

    expect(report.ok).toBe(true);
    expect(report.issue_count).toBe(0);
    expect(report.issues).toEqual([]);
    expect(dataSource.query).toHaveBeenCalledTimes(7);
  });

  it('reports unposted approved payments and unbalanced journal entries', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 10,
          amount: '100.00',
          accounting_status: 'pending_posting',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 90,
          entry_number: 'JE-2026-0001',
          total_debit: '100.00',
          total_credit: '90.00',
          difference: '10.00',
        },
      ]);

    const report = await service.getReport('tenant_alpha');

    expect(report.ok).toBe(false);
    expect(report.issue_count).toBe(2);
    expect(report.issues).toEqual([
      expect.objectContaining({
        code: 'approved_payments_not_posted',
        severity: 'error',
        count: 1,
      }),
      expect.objectContaining({
        code: 'unbalanced_journal_entries',
        severity: 'error',
        count: 1,
      }),
    ]);
  });

  it('enqueues unposted approved payments and processes tenant outbox', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 10 }, { id: 11 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.reprocessApprovedPaymentPostings(
      'tenant_alpha',
      250,
    );

    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
    expect(outboxService.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        eventType: 'payment.approved',
        aggregateType: 'payment',
        aggregateId: '10',
        payload: expect.objectContaining({ paymentId: 10 }),
      }),
    );
    expect(outboxProcessor.processPendingForSchema).toHaveBeenCalledWith(
      'tenant_alpha',
      100,
    );
    expect(result.enqueued_payments).toBe(2);
    expect(result.enqueued_expenses).toBe(0);
    expect(result.enqueued_expense_payments).toBe(0);
    expect(result.processed_events).toBe(2);
    expect(result.report.ok).toBe(true);
  });

  it('enqueues unposted expenses and expense payments separately', async () => {
    dataSource.query
      .mockResolvedValueOnce([{ id: 20 }])
      .mockResolvedValueOnce([{ id: 70, expense_id: 20 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.reprocessExpensePostings('tenant_alpha', 250);

    expect(outboxService.enqueue).toHaveBeenCalledTimes(2);
    expect(outboxService.enqueue).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        eventType: 'expense.created',
        aggregateType: 'expense',
        aggregateId: '20',
        payload: expect.objectContaining({ expenseId: 20 }),
      }),
    );
    expect(outboxService.enqueue).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        eventType: 'expense.payment.created',
        aggregateType: 'expense',
        aggregateId: '20',
        payload: expect.objectContaining({
          expenseId: 20,
          expensePaymentId: 70,
        }),
      }),
    );
    expect(outboxProcessor.processPendingForSchema).toHaveBeenCalledWith(
      'tenant_alpha',
      200,
    );
    expect(result.enqueued_payments).toBe(0);
    expect(result.enqueued_expenses).toBe(1);
    expect(result.enqueued_expense_payments).toBe(1);
    expect(result.processed_events).toBe(2);
    expect(result.report.ok).toBe(true);
  });
});
