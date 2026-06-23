import { DataSource } from 'typeorm';
import { AccountingExpensePostingService } from './accounting-expense-posting.service';
import { AccountingOutboxProcessor } from './accounting-outbox.processor';
import { AccountingOwnerStatementPostingService } from './accounting-owner-statement-posting.service';
import { AccountingPaymentPostingService } from './accounting-payment-posting.service';
import { AccountingPaymentRefundPostingService } from './accounting-payment-refund-posting.service';

describe('AccountingOutboxProcessor', () => {
  let dataSource: { query: jest.Mock };
  let paymentPosting: { postApprovedPayment: jest.Mock };
  let expensePosting: { postExpense: jest.Mock };
  let paymentRefundPosting: { postPaymentRefund: jest.Mock };
  let ownerStatementPosting: {
    postGeneratedStatement: jest.Mock;
    postStatementTransfer: jest.Mock;
  };
  let processor: AccountingOutboxProcessor;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    paymentPosting = {
      postApprovedPayment: jest.fn().mockResolvedValue({ id: 101 }),
    };
    expensePosting = {
      postExpense: jest.fn().mockResolvedValue({ id: 102 }),
    };
    paymentRefundPosting = {
      postPaymentRefund: jest.fn().mockResolvedValue({ id: 103 }),
    };
    ownerStatementPosting = {
      postGeneratedStatement: jest.fn().mockResolvedValue({ id: 104 }),
      postStatementTransfer: jest.fn().mockResolvedValue({ id: 105 }),
    };
    processor = new AccountingOutboxProcessor(
      dataSource as unknown as DataSource,
      paymentPosting as unknown as AccountingPaymentPostingService,
      expensePosting as unknown as AccountingExpensePostingService,
      paymentRefundPosting as unknown as AccountingPaymentRefundPostingService,
      ownerStatementPosting as unknown as AccountingOwnerStatementPostingService,
    );
  });

  it('processes pending payment approval events and marks them posted', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 7,
          event_type: 'payment.approved',
          aggregate_type: 'payment',
          aggregate_id: '33',
          payload: { paymentId: 33 },
          status: 'processing',
          attempts: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(paymentPosting.postApprovedPayment).toHaveBeenCalledWith(
      'tenant_alpha',
      33,
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [101, 7],
    );
  });

  it('handles driver tuple responses from update returning queries', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        [
          {
            id: 17,
            event_type: 'payment.approved',
            aggregate_type: 'payment',
            aggregate_id: '99',
            payload: { paymentId: 99 },
            status: 'processing',
            attempts: 1,
          },
        ],
        1,
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(paymentPosting.postApprovedPayment).toHaveBeenCalledWith(
      'tenant_alpha',
      99,
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [101, 17],
    );
  });

  it('does not process driver tuple responses with no rows', async () => {
    dataSource.query.mockResolvedValueOnce([[], 0]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(0);
    expect(paymentPosting.postApprovedPayment).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenCalledTimes(1);
  });

  it('marks unsupported events as failed with retry delay', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 8,
          event_type: 'unknown.event',
          aggregate_type: 'unknown',
          aggregate_id: 'x',
          payload: {},
          status: 'processing',
          attempts: 3,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(paymentPosting.postApprovedPayment).not.toHaveBeenCalled();
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining("SET status = 'failed'"),
      [expect.stringContaining('Evento contable no soportado'), 6, 8],
    );
  });

  it('processes expense created events', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 9,
          event_type: 'expense.created',
          aggregate_type: 'expense',
          aggregate_id: '44',
          payload: { expenseId: 44 },
          status: 'processing',
          attempts: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(expensePosting.postExpense).toHaveBeenCalledWith('tenant_alpha', 44);
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [102, 9],
    );
  });

  it('processes payment refund events', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 10,
          event_type: 'payment.refund.created',
          aggregate_type: 'payment_refund',
          aggregate_id: '55',
          payload: { refundId: 55 },
          status: 'processing',
          attempts: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(paymentRefundPosting.postPaymentRefund).toHaveBeenCalledWith(
      'tenant_alpha',
      55,
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [103, 10],
    );
  });

  it('processes owner statement generated events', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 11,
          event_type: 'owner_statement.generated',
          aggregate_type: 'owner_statement',
          aggregate_id: 'generated:77',
          payload: { statementId: 77 },
          status: 'processing',
          attempts: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(ownerStatementPosting.postGeneratedStatement).toHaveBeenCalledWith(
      'tenant_alpha',
      77,
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [104, 11],
    );
  });

  it('processes owner statement transferred events', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 12,
          event_type: 'owner_statement.transferred',
          aggregate_type: 'owner_statement',
          aggregate_id: 'transferred:77',
          payload: { statementId: 77 },
          status: 'processing',
          attempts: 1,
        },
      ])
      .mockResolvedValueOnce([]);

    const count = await processor.processPendingForSchema('tenant_alpha');

    expect(count).toBe(1);
    expect(ownerStatementPosting.postStatementTransfer).toHaveBeenCalledWith(
      'tenant_alpha',
      77,
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".accounting_outbox'),
      [105, 12],
    );
  });
});
