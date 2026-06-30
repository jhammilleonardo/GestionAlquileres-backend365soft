import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AccountingPaymentPostingService } from './accounting-payment-posting.service';
import { AccountingOutboxRow } from './accounting-outbox.types';
import { AccountingExpensePostingService } from './accounting-expense-posting.service';
import { AccountingOwnerStatementPostingService } from './accounting-owner-statement-posting.service';
import { AccountingPaymentRefundPostingService } from './accounting-payment-refund-posting.service';

interface TenantSchemaRow {
  schema_name: string;
}

@Injectable()
export class AccountingOutboxProcessor {
  private readonly logger = new Logger(AccountingOutboxProcessor.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly paymentPostingService: AccountingPaymentPostingService,
    private readonly expensePostingService: AccountingExpensePostingService,
    private readonly paymentRefundPostingService: AccountingPaymentRefundPostingService,
    private readonly ownerStatementPostingService: AccountingOwnerStatementPostingService,
  ) {}

  @Cron(CronExpression.EVERY_MINUTE)
  async processPendingEvents(): Promise<void> {
    const tenants = await this.dataSource.query<TenantSchemaRow[]>(
      `SELECT schema_name FROM public.tenant WHERE is_active = true`,
    );

    for (const tenant of tenants) {
      try {
        await this.processPendingForSchema(tenant.schema_name, 25);
      } catch (error) {
        this.logger.error(
          `Error procesando outbox contable de ${tenant.schema_name}`,
          error instanceof Error ? error.stack : undefined,
        );
      }
    }
  }

  async processPendingForSchema(
    schemaName: string,
    limit = 25,
  ): Promise<number> {
    const schema = quoteIdent(schemaName);
    const rawEvents = await this.dataSource.query<
      AccountingOutboxRow[] | [AccountingOutboxRow[], number]
    >(
      `
        UPDATE ${schema}.accounting_outbox
        SET status = 'processing',
            attempts = attempts + 1,
            updated_at = NOW()
        WHERE id IN (
          SELECT id
          FROM ${schema}.accounting_outbox
          WHERE status IN ('pending', 'failed')
            AND (next_retry_at IS NULL OR next_retry_at <= NOW())
          ORDER BY created_at ASC
          LIMIT $1
          FOR UPDATE SKIP LOCKED
        )
        RETURNING id, event_type, aggregate_type, aggregate_id, payload, status, attempts
      `,
      [limit],
    );
    const events = this.normalizeOutboxRows(rawEvents);

    for (const event of events) {
      await this.processEvent(schemaName, event);
    }

    return events.length;
  }

  private normalizeOutboxRows(
    rawEvents: AccountingOutboxRow[] | [AccountingOutboxRow[], number],
  ): AccountingOutboxRow[] {
    if (Array.isArray(rawEvents[0])) {
      return rawEvents[0];
    }

    return rawEvents as AccountingOutboxRow[];
  }

  private async processEvent(
    schemaName: string,
    event: AccountingOutboxRow,
  ): Promise<void> {
    try {
      const result = await this.handleEvent(schemaName, event);
      await this.markPosted(schemaName, event.id, result.id);
    } catch (error) {
      await this.markFailed(schemaName, event, error);
    }
  }

  private async handleEvent(
    schemaName: string,
    event: AccountingOutboxRow,
  ): Promise<{ id: number }> {
    if (event.event_type === 'payment.approved') {
      const payload = this.parsePayload(event.payload);
      const paymentId = Number(payload.paymentId);

      if (!Number.isInteger(paymentId) || paymentId <= 0) {
        throw new Error('Payload payment.approved sin paymentId valido.');
      }

      return this.paymentPostingService.postApprovedPayment(
        schemaName,
        paymentId,
      );
    }

    if (event.event_type === 'expense.created') {
      const payload = this.parsePayload(event.payload);
      const expenseId = Number(payload.expenseId);

      if (!Number.isInteger(expenseId) || expenseId <= 0) {
        throw new Error('Payload expense.created sin expenseId valido.');
      }

      return this.expensePostingService.postExpense(schemaName, expenseId);
    }

    if (event.event_type === 'expense.paid') {
      const payload = this.parsePayload(event.payload);
      const expenseId = Number(payload.expenseId);

      if (!Number.isInteger(expenseId) || expenseId <= 0) {
        throw new Error('Payload expense.paid sin expenseId valido.');
      }

      return this.expensePostingService.postExpensePayment(
        schemaName,
        expenseId,
      );
    }

    if (event.event_type === 'expense.payment.created') {
      const payload = this.parsePayload(event.payload);
      const expensePaymentId = Number(payload.expensePaymentId);

      if (!Number.isInteger(expensePaymentId) || expensePaymentId <= 0) {
        throw new Error(
          'Payload expense.payment.created sin expensePaymentId valido.',
        );
      }

      return this.expensePostingService.postExpenseVendorPayment(
        schemaName,
        expensePaymentId,
      );
    }

    if (event.event_type === 'payment.refund.created') {
      const payload = this.parsePayload(event.payload);
      const refundId = Number(payload.refundId);

      if (!Number.isInteger(refundId) || refundId <= 0) {
        throw new Error('Payload payment.refund.created sin refundId valido.');
      }

      return this.paymentRefundPostingService.postPaymentRefund(
        schemaName,
        refundId,
      );
    }

    if (event.event_type === 'owner_statement.generated') {
      const payload = this.parsePayload(event.payload);
      const statementId = Number(payload.statementId);

      if (!Number.isInteger(statementId) || statementId <= 0) {
        throw new Error(
          'Payload owner_statement.generated sin statementId valido.',
        );
      }

      return this.ownerStatementPostingService.postGeneratedStatement(
        schemaName,
        statementId,
      );
    }

    if (event.event_type === 'owner_statement.transferred') {
      const payload = this.parsePayload(event.payload);
      const statementId = Number(payload.statementId);

      if (!Number.isInteger(statementId) || statementId <= 0) {
        throw new Error(
          'Payload owner_statement.transferred sin statementId valido.',
        );
      }

      return this.ownerStatementPostingService.postStatementTransfer(
        schemaName,
        statementId,
      );
    }

    throw new Error(`Evento contable no soportado: ${event.event_type}`);
  }

  private async markPosted(
    schemaName: string,
    eventId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.accounting_outbox
        SET status = 'posted',
            journal_entry_id = $1,
            last_error = NULL,
            next_retry_at = NULL,
            updated_at = NOW()
        WHERE id = $2
      `,
      [journalEntryId, eventId],
    );
  }

  private async markFailed(
    schemaName: string,
    event: AccountingOutboxRow,
    error: unknown,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);
    const message = error instanceof Error ? error.message : String(error);
    const retryMinutes = Math.min(60, Math.max(1, event.attempts * 2));

    await this.dataSource.query(
      `
        UPDATE ${schema}.accounting_outbox
        SET status = 'failed',
            last_error = $1,
            next_retry_at = NOW() + ($2::text || ' minutes')::interval,
            updated_at = NOW()
        WHERE id = $3
      `,
      [message, retryMinutes, event.id],
    );

    this.logger.warn(
      `Evento contable ${event.id} fallo en ${schemaName}: ${message}`,
    );
  }

  private parsePayload(payload: AccountingOutboxRow['payload']): {
    paymentId?: unknown;
    expenseId?: unknown;
    expensePaymentId?: unknown;
    refundId?: unknown;
    statementId?: unknown;
  } {
    if (typeof payload === 'string') {
      return JSON.parse(payload) as {
        paymentId?: unknown;
        expenseId?: unknown;
        expensePaymentId?: unknown;
        refundId?: unknown;
        statementId?: unknown;
      };
    }

    return payload as {
      paymentId?: unknown;
      expenseId?: unknown;
      expensePaymentId?: unknown;
      refundId?: unknown;
      statementId?: unknown;
    };
  }
}
