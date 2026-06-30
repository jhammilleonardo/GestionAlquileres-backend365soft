import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { WebhookResult } from './processors/payment-processor.interface';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';
import { Money } from '../common/money';
import { ReservationPaymentConfirmationService } from './reservation-payment-confirmation.service';

interface WebhookEventInsertRow {
  event_id: string;
}

interface PaymentWebhookRow {
  id: number;
  tenant_id: number;
  amount: string | number;
  currency: string;
  status: string;
  reservation_id: number | null;
}

const WEBHOOK_TRANSITIONS: Readonly<Record<string, readonly string[]>> = {
  PROCESSING: ['PENDING'],
  APPROVED: ['PENDING', 'PROCESSING', 'DISPUTED'],
  REJECTED: ['PENDING', 'PROCESSING'],
  FAILED: ['PENDING', 'PROCESSING'],
  REFUNDED: ['APPROVED'],
  REVERSED: ['APPROVED', 'DISPUTED'],
  DISPUTED: ['APPROVED'],
};

@Injectable()
export class PaymentWebhookService {
  private readonly logger = new Logger(PaymentWebhookService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
    private readonly reservationConfirmationService: ReservationPaymentConfirmationService,
  ) {}

  async handleWebhookResult(
    tenantSlug: string,
    result: WebhookResult,
    processor: string,
  ): Promise<void> {
    if (result.status === 'IGNORED') return;

    const transactionId = result.transaction_id?.trim() ?? '';
    const referenceNumber = result.reference_number?.trim() ?? transactionId;
    if (!transactionId && !referenceNumber) return;
    if (!/^[a-z0-9_]{2,32}$/i.test(processor)) {
      throw new BadRequestException('Procesador de webhook inválido');
    }

    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    const schemaName = tenant.schema_name;
    const schema = quoteIdent(schemaName);
    const providerEventId =
      result.event_id ?? `${transactionId || referenceNumber}:${result.status}`;
    const eventId = `${processor}:${providerEventId}`;

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    let updated: PaymentWebhookRow[] = [];

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

      const matches = (await queryRunner.query(
        `SELECT id, tenant_id, amount, currency, status, reservation_id
           FROM ${schema}.payments
          WHERE LOWER(payment_processor) = LOWER($1)
            AND (
              ($2 <> '' AND transaction_id = $2) OR
              ($3 <> '' AND reference_number = $3)
            )
          ORDER BY id
          LIMIT 2
          FOR UPDATE`,
        [processor, transactionId, referenceNumber],
      )) as PaymentWebhookRow[];

      if (matches.length !== 1) {
        throw new BadRequestException(
          matches.length === 0
            ? 'No existe un pago que corresponda al webhook'
            : 'La referencia del webhook es ambigua',
        );
      }

      const payment = matches[0];
      this.assertAmountAndCurrency(payment, result);

      if (payment.status === result.status) {
        await queryRunner.commitTransaction();
        return;
      }

      const allowedFrom = WEBHOOK_TRANSITIONS[result.status] ?? [];
      if (!allowedFrom.includes(payment.status)) {
        this.logger.warn(
          `Webhook ${eventId} ignorado: transición ${payment.status} -> ${result.status} no permitida`,
        );
        await queryRunner.commitTransaction();
        return;
      }

      updated = (await queryRunner.query(
        `UPDATE ${schema}.payments
            SET status = $1,
                transaction_id = COALESCE(transaction_id, NULLIF($2, '')),
                processed_date = CASE WHEN $5 THEN NOW() ELSE processed_date END,
                updated_at = NOW()
          WHERE id = $3 AND status = $4
          RETURNING id, tenant_id, amount, currency, status, reservation_id`,
        [
          result.status,
          transactionId,
          payment.id,
          payment.status,
          result.status === 'APPROVED',
        ],
      )) as PaymentWebhookRow[];

      if (result.status === 'APPROVED' && updated[0]) {
        await this.reservationConfirmationService.confirmIfFullyPaid(
          queryRunner,
          schemaName,
          updated[0].reservation_id,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    if (updated.length === 0) {
      this.logger.warn(
        `handleWebhookResult: el pago cambió concurrentemente (tenant: ${tenantSlug})`,
      );
      return;
    }

    this.logger.log(
      `Pago #${updated[0].id} actualizado a ${result.status} via webhook (tenant: ${tenantSlug})`,
    );
  }

  private assertAmountAndCurrency(
    payment: PaymentWebhookRow,
    result: WebhookResult,
  ): void {
    if (result.amount !== undefined) {
      // Comparación exacta al centavo (sin tolerancia float): el monto del
      // webhook debe coincidir con el registrado, en unidad mínima.
      const expectedCents = Money.fromDb(
        payment.amount,
        payment.currency,
      ).toMinorUnits();
      const receivedCents = Number.isFinite(result.amount)
        ? Money.of(String(result.amount), payment.currency).toMinorUnits()
        : NaN;
      if (Number.isNaN(receivedCents) || expectedCents !== receivedCents) {
        throw new BadRequestException(
          'El monto del webhook no coincide con el pago',
        );
      }
    }

    if (
      result.currency &&
      payment.currency.toUpperCase() !== result.currency.toUpperCase()
    ) {
      throw new BadRequestException(
        'La moneda del webhook no coincide con el pago',
      );
    }
  }
}
