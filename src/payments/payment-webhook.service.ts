import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WebhookResult } from './processors/payment-processor.interface';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';

interface WebhookEventInsertRow {
  event_id: string;
}

interface PaymentWebhookUpdateRow {
  id: number;
  tenant_id: number;
}

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async handleWebhookResult(
    tenantSlug: string,
    result: WebhookResult,
    processor: string = 'unknown',
  ): Promise<void> {
    if (!result.transaction_id) return;

    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    const schemaName = tenant.schema_name;
    const schema = quoteIdent(schemaName);
    const eventId =
      result.event_id ??
      `${processor}:${result.transaction_id}:${result.status}`;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let updated: PaymentWebhookUpdateRow[] = [];

    try {
      const inserted = (await queryRunner.query(
        `INSERT INTO ${schema}.webhook_events (event_id, processor, event_status, raw_event)
         VALUES ($1, $2, $3, $4::jsonb)
         ON CONFLICT (event_id) DO NOTHING
         RETURNING event_id`,
        [
          eventId,
          processor,
          result.status,
          JSON.stringify(result.raw_event ?? null),
        ],
      )) as WebhookEventInsertRow[];

      if (inserted.length === 0) {
        await queryRunner.commitTransaction();
        this.logger.debug(
          `Webhook duplicado ignorado: ${eventId} (tenant: ${tenantSlug})`,
        );
        return;
      }

      updated = (await queryRunner.query(
        `UPDATE ${schema}.payments
         SET status = $1, updated_at = NOW()
         WHERE reference_number = $2
         RETURNING id, tenant_id`,
        [result.status, result.transaction_id],
      )) as PaymentWebhookUpdateRow[];

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (updated.length === 0) {
      this.logger.warn(
        `handleWebhookResult: ningún pago encontrado con reference_number=${result.transaction_id} (tenant: ${tenantSlug})`,
      );
      return;
    }

    this.logger.log(
      `Pago #${updated[0].id} actualizado a ${result.status} via webhook (tenant: ${tenantSlug})`,
    );
  }
}
