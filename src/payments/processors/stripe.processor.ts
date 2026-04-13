import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/**
 * Procesador Stripe — estructura lista para conectar cuando llegue la cuenta empresarial.
 *
 * Para activar:
 *   1. npm install stripe
 *   2. Agregar STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET al .env
 *   3. Reemplazar cada NotImplementedException con la llamada real al SDK de Stripe
 *
 * Documentación: https://stripe.com/docs/api
 */
@Injectable()
export class StripeProcessor implements IPaymentProcessor {
  readonly processorName = 'stripe';

  // TODO: inyectar ConfigService y instanciar Stripe SDK aquí
  // private readonly stripe: Stripe;
  // constructor(private readonly config: ConfigService) {
  //   this.stripe = new Stripe(config.get('STRIPE_SECRET_KEY'), { apiVersion: '2023-10-16' });
  // }

  async createPayment(
    _input: ProcessorPaymentInput,
  ): Promise<ProcessorResult> {
    // TODO: crear un PaymentIntent en Stripe
    // const paymentIntent = await this.stripe.paymentIntents.create({
    //   amount: Math.round(_input.amount * 100), // Stripe trabaja en centavos
    //   currency: _input.currency.toLowerCase(),
    //   metadata: { tenantId: _input.tenantId, contractId: _input.contractId },
    // });
    // return { success: true, transaction_id: paymentIntent.id, processor_fee: 0, status: 'PROCESSING' };
    throw new NotImplementedException(
      'Stripe no está configurado. Agrega STRIPE_SECRET_KEY al .env e implementa este método.',
    );
  }

  async confirmPayment(
    _transactionId: string,
  ): Promise<ProcessorResult> {
    // TODO: capturar el PaymentIntent
    // await this.stripe.paymentIntents.capture(_transactionId);
    throw new NotImplementedException('Stripe: confirmPayment no implementado');
  }

  async refundPayment(
    _transactionId: string,
    _amount: number,
  ): Promise<ProcessorResult> {
    // TODO: crear refund en Stripe
    // await this.stripe.refunds.create({ payment_intent: _transactionId, amount: Math.round(_amount * 100) });
    throw new NotImplementedException('Stripe: refundPayment no implementado');
  }

  async handleWebhook(
    _payload: unknown,
    _signature?: string,
  ): Promise<WebhookResult> {
    // TODO: verificar firma del webhook y procesar el evento
    // const event = this.stripe.webhooks.constructEvent(rawBody, _signature, webhookSecret);
    // switch (event.type) {
    //   case 'payment_intent.succeeded': ...
    //   case 'payment_intent.payment_failed': ...
    // }
    throw new NotImplementedException('Stripe: handleWebhook no implementado');
  }
}
