import { BadRequestException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingLedgerService } from './accounting-ledger.service';
import { AccountingPaymentRefundPostingService } from './accounting-payment-refund-posting.service';

describe('AccountingPaymentRefundPostingService', () => {
  let dataSource: { query: jest.Mock };
  let ledger: { postEntry: jest.Mock };
  let service: AccountingPaymentRefundPostingService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    ledger = { postEntry: jest.fn().mockResolvedValue({ id: 93 }) };
    service = new AccountingPaymentRefundPostingService(
      dataSource as unknown as DataSource,
      ledger as unknown as AccountingLedgerService,
    );
  });

  it('posts a rent refund against income and operating cash', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          refund_id: 55,
          payment_id: 33,
          amount: '25.00',
          refund_date: '2026-06-12',
          payment_type: 'RENT',
          property_id: 20,
          contract_id: 5,
        },
      ])
      .mockResolvedValueOnce([]);

    await service.postPaymentRefund('tenant_alpha', 55);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_alpha',
        entryDate: '2026-06-12',
        sourceModule: 'payment_refunds',
        sourceId: '55',
        lines: [
          expect.objectContaining({ accountCode: '4000', debit: 25 }),
          expect.objectContaining({ accountCode: '1100', credit: 25 }),
        ],
      }),
    );
    expect(dataSource.query).toHaveBeenLastCalledWith(
      expect.stringContaining('UPDATE "tenant_alpha".payment_refunds'),
      [93, 55],
    );
  });

  it('posts a deposit refund against security deposit liability', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        refund_id: 56,
        payment_id: 34,
        amount: '100.00',
        refund_date: '2026-06-12',
        payment_type: 'DEPOSIT',
        property_id: 20,
        contract_id: 5,
      },
    ]);

    await service.postPaymentRefund('tenant_alpha', 56);

    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [
          expect.objectContaining({ accountCode: '2200', debit: 100 }),
          expect.objectContaining({ accountCode: '1100', credit: 100 }),
        ],
      }),
    );
  });

  it('rejects missing refunds', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.postPaymentRefund('tenant_alpha', 999),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(ledger.postEntry).not.toHaveBeenCalled();
  });
});
