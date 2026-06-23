import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import {
  EnqueueAccountingEventInput,
  EnqueueAccountingEventOptions,
} from './accounting-outbox.types';

@Injectable()
export class AccountingOutboxService {
  constructor(private readonly dataSource: DataSource) {}

  async enqueue(
    input: EnqueueAccountingEventInput,
    options: EnqueueAccountingEventOptions = {},
  ): Promise<void> {
    const schema = quoteIdent(input.schemaName);
    const executor = options.queryRunner ?? this.dataSource;

    await executor.query(
      `
        INSERT INTO ${schema}.accounting_outbox (
          event_type,
          aggregate_type,
          aggregate_id,
          payload,
          status,
          attempts,
          created_at,
          updated_at
        )
        VALUES ($1, $2, $3, $4::jsonb, 'pending', 0, NOW(), NOW())
        ON CONFLICT (event_type, aggregate_type, aggregate_id) DO UPDATE SET
          payload = EXCLUDED.payload,
          status = CASE
            WHEN ${schema}.accounting_outbox.status = 'posted'
              THEN ${schema}.accounting_outbox.status
            ELSE 'pending'
          END,
          last_error = NULL,
          next_retry_at = NULL,
          updated_at = NOW()
      `,
      [
        input.eventType,
        input.aggregateType,
        input.aggregateId,
        JSON.stringify(input.payload),
      ],
    );
  }
}
