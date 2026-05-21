import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Stripe from 'stripe';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/** Tarifa Stripe: 2.9% + $0.30 para tarjetas nacionales USA */
const STRIPE_FEE_PERCENT = 0.029;
const STRIPE_FEE_FIXED = 0.3;
type StripeClient = InstanceType<typeof Stripe>;

@Injectable()
export class StripeProcessor implements IPaymentProcessor {
  readonly processorName = 'stripe';

  private _stripe: StripeClient | null = null;
  private readonly secretKey: string;
  private readonly webhookSecret: string;
  private readonly logger = new Logger(StripeProcessor.name);

  constructor(private readonly config: ConfigService) {
    this.secretKey = this.config.get<string>('STRIPE_SECRET_KEY', '');
    this.webhookSecret = this.config.get<string>('STRIPE_WEBHOOK_SECRET', '');
  }

  /** Instancia Stripe de forma diferida — evita error al arrancar sin STRIPE_SECRET_KEY */
  private get stripe(): StripeClient {
    if (!this._stripe) {
      if (!this.secretKey) {
        throw new Error(
          'Stripe no está configurado. Agrega STRIPE_SECRET_KEY al .env para habilitarlo.',
        );
      }
      this._stripe = new Stripe(this.secretKey);
    }
    return this._stripe;
  }

  async createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult> {
    const amountCents = Math.round(input.amount * 100);
    const processorFee = parseFloat(
      (input.amount * STRIPE_FEE_PERCENT + STRIPE_FEE_FIXED).toFixed(2),
    );

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount: amountCents,
      currency: input.currency.toLowerCase(),
      metadata: {
        tenantId: String(input.tenantId),
        contractId: String(input.contractId),
        propertyId: String(input.propertyId),
        reference: input.reference_number ?? '',
      },
    });

    this.logger.log(
      `Stripe PaymentIntent creado: ${paymentIntent.id} | tenant: ${input.tenantId}`,
    );

    return {
      success: true,
      transaction_id: paymentIntent.id,
      processor_fee: processorFee,
      status: 'PROCESSING',
    };
  }

  async confirmPayment(transactionId: string): Promise<ProcessorResult> {
    const paymentIntent =
      await this.stripe.paymentIntents.capture(transactionId);
    const succeeded = paymentIntent.status === 'succeeded';

    return {
      success: succeeded,
      transaction_id: paymentIntent.id,
      processor_fee: 0,
      status: succeeded ? 'APPROVED' : 'FAILED',
    };
  }

  async refundPayment(
    transactionId: string,
    amount: number,
  ): Promise<ProcessorResult> {
    const refund = await this.stripe.refunds.create({
      payment_intent: transactionId,
      amount: Math.round(amount * 100),
    });

    const succeeded = refund.status === 'succeeded';

    return {
      success: succeeded,
      transaction_id: refund.id,
      processor_fee: 0,
      status: succeeded ? 'APPROVED' : 'FAILED',
    };
  }

  /**
   * Verifica la firma HMAC y procesa el evento Stripe.
   * @param payload  Buffer con el cuerpo raw del request (antes de parsear JSON)
   * @param signature Cabecera Stripe-Signature
   */
  handleWebhook(payload: unknown, signature?: string): Promise<WebhookResult> {
    let event: ReturnType<typeof this.stripe.webhooks.constructEvent>;

    try {
      event = this.stripe.webhooks.constructEvent(
        payload as string | Buffer,
        signature ?? '',
        this.webhookSecret,
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'firma inválida';
      this.logger.error(
        `Stripe webhook: verificación de firma fallida — ${msg}`,
      );
      return Promise.reject(
        new BadRequestException('Stripe webhook: firma inválida'),
      );
    }

    this.logger.log(`Stripe webhook recibido: ${event.type}`);

    switch (event.type) {
      case 'payment_intent.succeeded': {
        const pi = event.data.object as { id: string };
        return Promise.resolve({
          event_id: event.id,
          transaction_id: pi.id,
          status: 'APPROVED',
          raw_event: event,
        });
      }
      case 'payment_intent.payment_failed': {
        const pi = event.data.object as { id: string };
        return Promise.resolve({
          event_id: event.id,
          transaction_id: pi.id,
          status: 'FAILED',
          raw_event: event,
        });
      }
      case 'charge.refunded': {
        const charge = event.data.object as {
          id: string;
          payment_intent: string | null;
        };
        const txnId = charge.payment_intent ?? charge.id;
        return Promise.resolve({
          event_id: event.id,
          transaction_id: txnId,
          status: 'APPROVED',
          raw_event: event,
        });
      }
      default:
        this.logger.debug(`Stripe webhook: evento no manejado — ${event.type}`);
        return Promise.resolve({
          event_id: event.id,
          status: 'APPROVED',
          raw_event: event,
        });
    }
  }
}
