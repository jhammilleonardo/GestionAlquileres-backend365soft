import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingPaymentPostingService } from './accounting-payment-posting.service';

describe('AccountingPaymentPostingService', () => {
  let dataSource: { query: jest.Mock };
  let ledger: { postEntry: jest.Mock };
  let service: AccountingPaymentPostingService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    ledger = { postEntry: jest.fn().mockResolvedValue({ id: 91 }) };
    service = new AccountingPaymentPostingService(
      dataSource as unknown as DataSource,
      ledger as unknown as AccountingLedgerService,
    );
  });

  it('posts an approved rent payment to cash and rental income', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 33,
          contract_id: 5,
          property_id: 20,
          amount: '100.00',
          payment_type: 'RENT',
          payment_date: '2026-06-12',
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postApprovedPayment('tenant_alpha', 33);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        sourceModule: 'payments',
        sourceId: '33',
        lines: [
          expect.objectContaining({ accountCode: '1100', debit: 100 }),
          expect.objectContaining({ accountCode: '4000', credit: 100 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".payments'),
      [91, 33],
    );
  });

  it('posts a deposit payment to security deposits liability', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 34,
        contract_id: 5,
        property_id: 20,
        amount: '250.00',
        payment_type: 'DEPOSIT',
        payment_date: '2026-06-12',
      },
    ]);

    await service.postApprovedPayment('tenant_alpha', 34);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({ accountCode: '1100', debit: 250 }),
          expect.objectContaining({ accountCode: '2200', credit: 250 }),
        ],
      }),
    );
  });

  it('rejects missing approved payments', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.postApprovedPayment('tenant_alpha', 999),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledger.postEntry).not.toHaveBeenCalled();
  });
});
