import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingPeriodsService } from './accounting-periods.service';

describe('AccountingLedgerService', () => {
  let queryRunner: {
    connect: jest.Mock;
    startTransaction: jest.Mock;
    commitTransaction: jest.Mock;
    rollbackTransaction: jest.Mock;
    release: jest.Mock;
    query: jest.Mock;
  };
  let periodsService: { assertPeriodOpen: jest.Mock };
  let service: AccountingLedgerService;

  beforeEach(() => {
    queryRunner = {
      connect: jest.fn().mockResolvedValue(undefined),
      startTransaction: jest.fn().mockResolvedValue(undefined),
      commitTransaction: jest.fn().mockResolvedValue(undefined),
      rollbackTransaction: jest.fn().mockResolvedValue(undefined),
      release: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(),
    };

    const dataSource = {
      createQueryRunner: jest.fn().mockReturnValue(queryRunner),
    };
    periodsService = {
      assertPeriodOpen: jest.fn().mockResolvedValue(undefined),
    };

    service = new AccountingLedgerService(
      dataSource as unknown as DataSource,
      periodsService as unknown as AccountingPeriodsService,
    );
  });

  it('posts a balanced journal entry inside a transaction', async () => {
    queryRunner.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 77, entry_number: 'JE-test' }])
      .mockResolvedValueOnce([{ id: 1 }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([{ id: 2 }])
      .mockResolvedValueOnce([]);

    const result = await service.postEntry({
      schemaName: 'tenant_alpha',
      entryDate: '2026-06-12',
      description: 'Rent payment posting',
      sourceModule: 'payments',
      sourceId: '123',
      lines: [
        { accountCode: '1100', debit: 100, paymentId: 123 },
        { accountCode: '4000', credit: 100, paymentId: 123 },
      ],
    });

    expect(result).toEqual({ id: 77, entryNumber: 'JE-test' });
    expect(queryRunner.connect).toHaveBeenCalledTimes(1);
    expect(queryRunner.startTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.rollbackTransaction).not.toHaveBeenCalled();
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
    expect(periodsService.assertPeriodOpen).toHaveBeenCalledWith(
      'tenant_alpha',
      '2026-06-12',
      queryRunner,
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_alpha".journal_entries'),
      expect.arrayContaining([
        '2026-06-12',
        'Rent payment posting',
        'payments',
        '123',
        'cash',
      ]),
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_alpha".journal_lines'),
      expect.arrayContaining([77, 1, null, null, null, null, null, null, 123]),
    );
  });

  it('returns an existing source entry without duplicating journal lines', async () => {
    queryRunner.query.mockResolvedValueOnce([
      { id: 88, entry_number: 'JE-existing' },
    ]);

    const result = await service.postEntry({
      schemaName: 'tenant_alpha',
      entryDate: '2026-06-12',
      description: 'Rent payment posting',
      sourceModule: 'payments',
      sourceId: '123',
      lines: [
        { accountCode: '1100', debit: 100, paymentId: 123 },
        { accountCode: '4000', credit: 100, paymentId: 123 },
      ],
    });

    expect(result).toEqual({ id: 88, entryNumber: 'JE-existing' });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
    expect(periodsService.assertPeriodOpen).not.toHaveBeenCalled();
  });

  it('rejects unbalanced entries before opening a transaction', async () => {
    await expect(
      service.postEntry({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        description: 'Broken entry',
        lines: [
          { accountCode: '1100', debit: 100 },
          { accountCode: '4000', credit: 99 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(queryRunner.connect).not.toHaveBeenCalled();
  });

  it('rolls back if an account code cannot be resolved', async () => {
    queryRunner.query
      .mockResolvedValueOnce([{ id: 77, entry_number: 'JE-test' }])
      .mockResolvedValueOnce([]);

    await expect(
      service.postEntry({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        description: 'Rent payment posting',
        lines: [
          { accountCode: '1100', debit: 100 },
          { accountCode: '9999', credit: 100 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.release).toHaveBeenCalledTimes(1);
  });

  it('blocks posting when the accounting period is closed', async () => {
    periodsService.assertPeriodOpen.mockRejectedValueOnce(
      new BadRequestException('Periodo cerrado'),
    );
    queryRunner.query.mockResolvedValueOnce([]);

    await expect(
      service.postEntry({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        description: 'Rent payment posting',
        sourceModule: 'payments',
        sourceId: '123',
        lines: [
          { accountCode: '1100', debit: 100 },
          { accountCode: '4000', credit: 100 },
        ],
      }),
    ).rejects.toThrow(BadRequestException);

    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledTimes(1);
  });

  it('creates a reversal entry and marks the original as reversed', async () => {
    queryRunner.query
      .mockResolvedValueOnce([
        { id: 77, entry_number: 'JE-original', basis: 'cash' },
      ])
      .mockResolvedValueOnce([
        {
          account_id: 1,
          property_id: null,
          unit_id: null,
          owner_id: null,
          tenant_user_id: null,
          vendor_id: null,
          contract_id: null,
          payment_id: 123,
          expense_id: null,
          debit: '100.00',
          credit: '0.00',
          memo: 'Cash received',
        },
        {
          account_id: 2,
          property_id: null,
          unit_id: null,
          owner_id: null,
          tenant_user_id: null,
          vendor_id: null,
          contract_id: null,
          payment_id: 123,
          expense_id: null,
          debit: '0.00',
          credit: '100.00',
          memo: 'Rent income',
        },
      ])
      .mockResolvedValueOnce([{ id: 89, entry_number: 'JE-reversal' }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const result = await service.reverseEntry({
      schemaName: 'tenant_alpha',
      entryId: 77,
      reversalDate: '2026-06-13',
    });

    expect(result).toEqual({ id: 89, entryNumber: 'JE-reversal' });
    expect(queryRunner.commitTransaction).toHaveBeenCalledTimes(1);
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".journal_entries'),
      [89, 77],
    );
    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_alpha".journal_lines'),
      expect.arrayContaining([
        89,
        1,
        null,
        null,
        null,
        null,
        null,
        null,
        123,
        null,
        0,
        100,
      ]),
    );
  });

  it('blocks reversal when the reversal period is closed', async () => {
    periodsService.assertPeriodOpen.mockRejectedValueOnce(
      new BadRequestException('Periodo cerrado'),
    );
    queryRunner.query.mockResolvedValueOnce([
      { id: 77, entry_number: 'JE-original', basis: 'cash' },
    ]);

    await expect(
      service.reverseEntry({
        schemaName: 'tenant_alpha',
        entryId: 77,
        reversalDate: '2026-06-13',
      }),
    ).rejects.toThrow(BadRequestException);

    expect(periodsService.assertPeriodOpen).toHaveBeenCalledWith(
      'tenant_alpha',
      '2026-06-13',
      queryRunner,
    );
    expect(queryRunner.rollbackTransaction).toHaveBeenCalledTimes(1);
  });
});
