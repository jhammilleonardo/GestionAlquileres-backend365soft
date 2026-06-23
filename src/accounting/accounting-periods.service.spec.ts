import { BadRequestException, ConflictException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AccountingPeriodsService } from './accounting-periods.service';

describe('AccountingPeriodsService', () => {
  let dataSource: { query: jest.Mock };
  let service: AccountingPeriodsService;

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    service = new AccountingPeriodsService(dataSource as unknown as DataSource);
  });

  it('allows posting when the period row does not exist yet', async () => {
    dataSource.query.mockResolvedValueOnce([]);

    await service.assertPeriodOpen('tenant_alpha', '2026-06-12');

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_alpha".accounting_periods'),
      [2026, 6],
    );
  });

  it('blocks posting in a closed accounting period', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        period_year: 2026,
        period_month: 6,
        status: 'closed',
        closed_at: new Date(),
        closed_by: 7,
        reopened_at: null,
        reopened_by: null,
        reopen_reason: null,
      },
    ]);

    await expect(
      service.assertPeriodOpen('tenant_alpha', '2026-06-12'),
    ).rejects.toThrow(ConflictException);
  });

  it('closes a period idempotently', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        period_year: 2026,
        period_month: 6,
        status: 'closed',
        closed_at: '2026-06-30T23:59:59.000Z',
        closed_by: 9,
        reopened_at: null,
        reopened_by: null,
        reopen_reason: null,
      },
    ]);

    const result = await service.closePeriod('tenant_alpha', 2026, 6, 9);

    expect(result).toMatchObject({
      id: 1,
      year: 2026,
      month: 6,
      status: 'closed',
      closedBy: 9,
    });
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT (period_year, period_month)'),
      [2026, 6, 9],
    );
  });

  it('requires a reason when reopening a period', async () => {
    await expect(
      service.reopenPeriod('tenant_alpha', 2026, 6, 9, '  '),
    ).rejects.toThrow(BadRequestException);

    expect(dataSource.query).not.toHaveBeenCalled();
  });

  it('reopens a period with audit data', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        id: 1,
        period_year: 2026,
        period_month: 6,
        status: 'open',
        closed_at: '2026-06-30T23:59:59.000Z',
        closed_by: 9,
        reopened_at: '2026-07-02T12:00:00.000Z',
        reopened_by: 11,
        reopen_reason: 'Corrective posting required',
      },
    ]);

    const result = await service.reopenPeriod(
      'tenant_alpha',
      2026,
      6,
      11,
      ' Corrective posting required ',
    );

    expect(result).toMatchObject({
      status: 'open',
      reopenedBy: 11,
      reopenReason: 'Corrective posting required',
    });
  });

  it('rejects invalid dates and period ranges', async () => {
    await expect(
      service.assertPeriodOpen('tenant_alpha', '06/12/2026'),
    ).rejects.toThrow(BadRequestException);

    await expect(service.closePeriod('tenant_alpha', 2026, 13)).rejects.toThrow(
      BadRequestException,
    );
  });
});
