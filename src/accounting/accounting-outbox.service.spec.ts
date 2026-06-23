import { DataSource, QueryRunner } from 'typeorm';
import { AccountingOutboxService } from './accounting-outbox.service';

describe('AccountingOutboxService', () => {
  it('enqueues an idempotent accounting event using the provided transaction', async () => {
    const queryRunner = {
      query: jest
        .fn<Promise<unknown>, [string, unknown[]?]>()
        .mockResolvedValue([]),
    };
    const service = new AccountingOutboxService({} as DataSource);

    await service.enqueue(
      {
        schemaName: 'tenant_alpha',
        eventType: 'payment.approved',
        aggregateType: 'payment',
        aggregateId: '33',
        payload: { paymentId: 33 },
      },
      { queryRunner: queryRunner as unknown as QueryRunner },
    );

    expect(queryRunner.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_alpha".accounting_outbox'),
      ['payment.approved', 'payment', '33', JSON.stringify({ paymentId: 33 })],
    );
    const firstCall = queryRunner.query.mock.calls[0];
    const firstSql = firstCall?.[0] ?? '';
    expect(firstSql).toContain(
      'ON CONFLICT (event_type, aggregate_type, aggregate_id)',
    );
  });
});
