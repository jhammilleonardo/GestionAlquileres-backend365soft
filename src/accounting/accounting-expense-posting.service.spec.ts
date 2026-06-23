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
          date: '2026-06-12',
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
      [92, 44],
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
