import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingBankReconciliationService } from './accounting-bank-reconciliation.service';

describe('AccountingBankReconciliationService', () => {
  let dataSource: { createQueryRunner: jest.Mock };
  let runner: {
    isTransactionActive: boolean;
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let service: AccountingBankReconciliationService;

  beforeEach(() => {
    runner = {
      isTransactionActive: false,
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };
    dataSource = {
      createQueryRunner: jest.fn(() => runner),
    };
    service = new AccountingBankReconciliationService(
      dataSource as unknown as DataSource,
    );
  });

  it('matches a bank transaction to an operating cash journal line', async () => {
    runner.query.mockResolvedValueOnce([
      {
        bank_transaction_id: 4,
        bank_amount: '-100.00',
        bank_status: 'imported',
        matched_journal_line_id: null,
        gl_account_id: 3,
        journal_line_id: 9,
        line_account_id: 3,
        debit: '0.00',
        credit: '100.00',
        account_code: '1100',
      },
    ]);
    runner.query.mockResolvedValueOnce([]);

    await expect(
      service.matchBankTransaction('tenant_alpha', 4, 9),
    ).resolves.toEqual({
      matched: true,
    });

    expect(runner.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".bank_transactions'),
      [9, 4],
    );
    expect(runner.commitTransaction).toHaveBeenCalled();
  });

  it('rejects amount mismatches', async () => {
    runner.query.mockResolvedValueOnce([
      {
        bank_transaction_id: 4,
        bank_amount: '-90.00',
        bank_status: 'imported',
        matched_journal_line_id: null,
        gl_account_id: 3,
        journal_line_id: 9,
        line_account_id: 3,
        debit: '0.00',
        credit: '100.00',
        account_code: '1100',
      },
    ]);

    await expect(
      service.matchBankTransaction('tenant_alpha', 4, 9),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(runner.rollbackTransaction).toHaveBeenCalled();
  });

  it('lists imported bank transactions pending review', async () => {
    (dataSource as { query?: jest.Mock }).query = jest.fn().mockResolvedValue([
      {
        id: 4,
        bank_account_id: 2,
        bank_account_name: 'Cuenta operativa',
        bank_name: 'Banco Union',
        transaction_date: '2026-06-25',
        description: 'Pago renta',
        amount: '100.50',
        currency: 'BOB',
        external_id: 'EXT-1',
        status: 'imported',
      },
    ]);

    const rows = await service.getOpenTransactions('tenant_alpha', 2, 250);

    expect(rows[0]).toMatchObject({
      id: 4,
      amount: 100.5,
      status: 'imported',
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_alpha".bank_transactions bt'),
      [2, 100],
    );
  });

  it('returns candidate journal lines for an imported transaction', async () => {
    (dataSource as { query?: jest.Mock }).query = jest.fn().mockResolvedValue([
      {
        journal_line_id: 9,
        journal_entry_id: 5,
        entry_number: 'JE-2026-0005',
        entry_date: '2026-06-25',
        description: 'Pago aprobado',
        account_code: '1100',
        account_name: 'Banco',
        debit: '100.00',
        credit: '0.00',
        amount: '100.00',
        days_distance: '0',
      },
    ]);

    const rows = await service.getMatchCandidates('tenant_alpha', 4, 30);

    expect(rows[0]).toMatchObject({
      journal_line_id: 9,
      debit: 100,
      amount: 100,
      days_distance: 0,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('WITH target AS'),
      [4, 25],
    );
  });
});
