import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingOwnerStatementPostingService } from './accounting-owner-statement-posting.service';

describe('AccountingOwnerStatementPostingService', () => {
  let dataSource: { query: jest.Mock };
  let ledger: { postEntry: jest.Mock };
  let service: AccountingOwnerStatementPostingService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    ledger = { postEntry: jest.fn().mockResolvedValue({ id: 94 }) };
    service = new AccountingOwnerStatementPostingService(
      dataSource as unknown as DataSource,
      ledger as unknown as AccountingLedgerService,
    );
  });

  it('posts owner statement generation to owner payable and management fee', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 77,
          rental_owner_id: 5,
          property_id: 20,
          unit_id: null,
          gross_rent: '1000.00',
          maintenance_deduction: '100.00',
          management_commission: '150.00',
          net_amount: '750.00',
          period_year: 2026,
          period_month: 6,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postGeneratedStatement('tenant_alpha', 77);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-01',
        sourceModule: 'owner_statements',
        sourceId: 'generated:77',
        lines: [
          expect.objectContaining({ accountCode: '4000', debit: 1000 }),
          expect.objectContaining({ accountCode: '4200', credit: 150 }),
          expect.objectContaining({ accountCode: '2100', credit: 750 }),
          expect.objectContaining({ accountCode: '5200', credit: 100 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".owner_statements'),
      [94, 77],
    );
  });

  it('posts owner statement transfer against owner payable and cash', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 77,
          rental_owner_id: 5,
          property_id: 20,
          unit_id: null,
          gross_rent: '1000.00',
          maintenance_deduction: '100.00',
          management_commission: '150.00',
          net_amount: '750.00',
          period_year: 2026,
          period_month: 6,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postStatementTransfer('tenant_alpha', 77);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        sourceModule: 'owner_statement_transfers',
        sourceId: '77',
        lines: [
          expect.objectContaining({ accountCode: '2100', debit: 750 }),
          expect.objectContaining({ accountCode: '1100', credit: 750 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('transfer_journal_entry_id = $1'),
      [94, 77],
    );
  });

  it('rejects statements that do not balance', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 77,
        rental_owner_id: 5,
        property_id: 20,
        unit_id: null,
        gross_rent: '1000.00',
        maintenance_deduction: '10.00',
        management_commission: '150.00',
        net_amount: '750.00',
        period_year: 2026,
        period_month: 6,
      },
    ]);

    await expect(
      service.postGeneratedStatement('tenant_alpha', 77),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledger.postEntry).not.toHaveBeenCalled();
  });
});
