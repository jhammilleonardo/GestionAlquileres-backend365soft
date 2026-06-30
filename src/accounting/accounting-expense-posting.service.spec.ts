import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingExpensePostingService } from './accounting-expense-posting.service';

describe('AccountingExpensePostingService', () => {
  let dataSource: { query: jest.Mock };
  let ledger: { postEntry: jest.Mock };
  let service: AccountingExpensePostingService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    ledger = { postEntry: jest.fn().mockResolvedValue({ id: 92 }) };
    service = new AccountingExpensePostingService(
      dataSource as unknown as DataSource,
      ledger as unknown as AccountingLedgerService,
    );
  });

  it('posts a maintenance expense to maintenance expense and operating cash', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 44,
          property_id: 20,
          unit_id: null,
          vendor_id: 3,
          amount: '75.50',
          category: 'MAINTENANCE',
          payment_status: 'PAID',
          date: '2026-06-12',
          paid_date: '2026-06-12',
          description: 'Repair',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postExpense('tenant_alpha', 44);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        sourceModule: 'expenses',
        sourceId: '44',
        lines: [
          expect.objectContaining({ accountCode: '5200', debit: 75.5 }),
          expect.objectContaining({ accountCode: '1100', credit: 75.5 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".expenses'),
      ['posted', 92, 44],
    );
  });

  it('posts a pending expense to vendor payable instead of cash', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 45,
          property_id: 20,
          unit_id: null,
          vendor_id: 3,
          amount: '100.00',
          category: 'MAINTENANCE',
          payment_status: 'PENDING',
          date: '2026-06-12',
          paid_date: null,
          description: 'Invoice pending',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postExpense('tenant_alpha', 45);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        basis: 'accrual',
        sourceModule: 'expenses',
        sourceId: '45',
        lines: [
          expect.objectContaining({ accountCode: '5200', debit: 100 }),
          expect.objectContaining({ accountCode: '2300', credit: 100 }),
        ],
      }),
    );
  });

  it('posts payment of a pending expense to vendor payable and cash', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 45,
          property_id: 20,
          unit_id: null,
          vendor_id: 3,
          amount: '100.00',
          category: 'MAINTENANCE',
          payment_status: 'PAID',
          date: '2026-06-12',
          paid_date: '2026-06-20',
          description: 'Invoice paid',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postExpensePayment('tenant_alpha', 45);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: '2026-06-20',
        basis: 'cash',
        sourceModule: 'expense-payments',
        sourceId: '45',
        lines: [
          expect.objectContaining({ accountCode: '2300', debit: 100 }),
          expect.objectContaining({ accountCode: '1100', credit: 100 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".expenses'),
      ['paid_posted', 92, 45],
    );
  });

  it('posts an expense vendor payment using the payment amount', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 70,
          expense_id: 45,
          property_id: 20,
          unit_id: null,
          vendor_id: 3,
          amount: '40.00',
          currency: 'BOB',
          category: 'MAINTENANCE',
          payment_date: '2026-06-21',
          payment_method: 'TRANSFER',
          reference_number: 'TRX-1',
          notes: 'Primer abono',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postExpenseVendorPayment('tenant_alpha', 70);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        entryDate: '2026-06-21',
        sourceModule: 'expense-payments',
        sourceId: '70',
        lines: [
          expect.objectContaining({ accountCode: '2300', debit: 40 }),
          expect.objectContaining({ accountCode: '1100', credit: 40 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".expense_payments'),
      [92, 70],
    );
  });

  it('rejects missing expenses', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.postExpense('tenant_alpha', 999),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledger.postEntry).not.toHaveBeenCalled();
  });
});
