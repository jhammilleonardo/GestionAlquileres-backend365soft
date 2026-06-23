import type { QueryRunner } from 'typeorm';

export type AccountingOutboxStatus =
  | 'pending'
  | 'processing'
  | 'posted'
  | 'failed';

export interface EnqueueAccountingEventInput {
  schemaName: string;
  eventType: string;
  aggregateType: string;
  aggregateId: string;
  payload: Record<string, unknown>;
}

export interface EnqueueAccountingEventOptions {
  queryRunner?: QueryRunner;
}

export interface AccountingOutboxRow {
  id: number;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown> | string;
  status: AccountingOutboxStatus;
  attempts: number;
}
