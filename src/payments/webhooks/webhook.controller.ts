import {
  Controller,
  Post,
  Param,
  Headers,
  Body,
  Req,
  Logger,
  HttpCode,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { StripeProcessor } from '../processors/stripe.processor';
import { PayPalProcessor } from '../processors/paypal.processor';
import { PayUProcessor } from '../processors/payu.processor';
import { PaymentsService } from '../payments.service';

/**
 * WebhookController — endpoints públicos para recibir notificaciones de pagos.
 *
 * No requieren JWT. Cada procesador verifica la autenticidad de la llamada
 * con su propio mecanismo de firma antes de actualizar el estado del pago.
 *
 * Configurar en el dashboard de cada procesador:
 *   Stripe  → POST https://<dominio>/:slug/publico/webhooks/stripe
 *   PayPal  → POST https://<dominio>/:slug/publico/webhooks/paypal
 *   PayU    → POST https://<dominio>/:slug/publico/webhooks/payu
 *
 * QR Bolivia usa su propio endpoint dedicado:
 *   POST /:slug/publico/qr/callback  (PublicQrPaymentController)
 */
@Controller(':slug/publico/webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly stripeProcessor: StripeProcessor,
    private readonly paypalProcessor: PayPalProcessor,
    private readonly payuProcessor: PayUProcessor,
    private readonly paymentsService: PaymentsService,
  ) {}

  /**
   * POST /:slug/publico/webhooks/stripe
   *
   * Requiere el cuerpo raw (Buffer) para verificar la firma HMAC-SHA256.
   * NestJS expone req.rawBody cuando la app se crea con { rawBody: true }.
   * Stripe-Signature: t=<timestamp>,v1=<hmac>,...
   */
  @Post('stripe')
  @HttpCode(200)
  async stripeWebhook(
    @Param('slug') slug: string,
    @Req() req: RawBodyRequest<Request>,
    @Headers('stripe-signature') signature: string,
  ): Promise<{ received: boolean }> {
    const rawBody: Buffer = req.rawBody ?? Buffer.from('');

    const result = await this.stripeProcessor.handleWebhook(
      rawBody,
      signature,
    );

    if (result.transaction_id) {
      await this.paymentsService.handleWebhookResult(slug, result);
    }

    return { received: true };
  }

  /**
   * POST /:slug/publico/webhooks/paypal
   *
   * PayPal envía JSON. La verificación de firma se hace llamando a la API
   * de PayPal con los headers de la solicitud original.
   */
  @Post('paypal')
  @HttpCode(200)
  async paypalWebhook(
    @Param('slug') slug: string,
    @Body() payload: Record<string, unknown>,
    @Headers() headers: Record<string, string>,
  ): Promise<{ received: boolean }> {
    const signatureHeaders = JSON.stringify({
      'paypal-auth-algo': headers['paypal-auth-algo'],
      'paypal-cert-url': headers['paypal-cert-url'],
      'paypal-transmission-id': headers['paypal-transmission-id'],
      'paypal-transmission-sig': headers['paypal-transmission-sig'],
      'paypal-transmission-time': headers['paypal-transmission-time'],
    });

    const result = await this.paypalProcessor.handleWebhook(
      payload,
      signatureHeaders,
    );

    if (result.transaction_id) {
      await this.paymentsService.handleWebhookResult(slug, result);
    }

    return { received: true };
  }

  /**
   * POST /:slug/publico/webhooks/payu
   *
   * PayU envía application/x-www-form-urlencoded (IPN).
   * La verificación de firma es interna (md5 sobre campos del body).
   */
  @Post('payu')
  @HttpCode(200)
  async payuWebhook(
    @Param('slug') slug: string,
    @Body() payload: Record<string, string>,
  ): Promise<{ received: boolean }> {
    const result = await this.payuProcessor.handleWebhook(payload);

    if (result.transaction_id) {
      await this.paymentsService.handleWebhookResult(slug, result);
    }

    return { received: true };
  }
}
