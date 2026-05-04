import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/** Tarifa PayPal: 3.49% + $0.49 (pagos internacionales estándar) */
const PAYPAL_FEE_PERCENT = 0.0349;
const PAYPAL_FEE_FIXED = 0.49;

/**
 * Procesador PayPal — REST API v2 (Orders API).
 *
 * Para activar en producción:
 *   1. Crear app en https://developer.paypal.com/dashboard/applications/live
 *   2. Agregar PAYPAL_CLIENT_ID, PAYPAL_CLIENT_SECRET, PAYPAL_WEBHOOK_ID al .env
 *   3. Cambiar PAYPAL_BASE_URL a https://api-m.paypal.com
 *
 * Sandbox: https://api-m.sandbox.paypal.com
 */
@Injectable()
export class PayPalProcessor implements IPaymentProcessor {
  readonly processorName = 'paypal';

  private readonly baseUrl: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly webhookId: string;
  private readonly logger = new Logger(PayPalProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.config.get<string>(
      'PAYPAL_BASE_URL',
      'https://api-m.sandbox.paypal.com',
    );
    this.clientId = this.config.get<string>('PAYPAL_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('PAYPAL_CLIENT_SECRET', '');
    this.webhookId = this.config.get<string>('PAYPAL_WEBHOOK_ID', '');
  }

  private async getAccessToken(): Promise<string> {
    const credentials = Buffer.from(
      `${this.clientId}:${this.clientSecret}`,
    ).toString('base64');

    const resp = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v1/oauth2/token`,
        'grant_type=client_credentials',
        {
          headers: {
            Authorization: `Basic ${credentials}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          timeout: 15000,
        },
      ),
    );

    return resp.data.access_token as string;
  }

  async createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult> {
    const processorFee = parseFloat(
      (input.amount * PAYPAL_FEE_PERCENT + PAYPAL_FEE_FIXED).toFixed(2),
    );

    const token = await this.getAccessToken();

    const resp = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v2/checkout/orders`,
        {
          intent: 'CAPTURE',
          purchase_units: [
            {
              amount: {
                currency_code: input.currency.toUpperCase(),
                value: input.amount.toFixed(2),
              },
              description:
                input.notes ?? `Pago contrato #${input.contractId}`,
              custom_id: String(input.contractId),
              reference_id:
                input.reference_number ?? `REF-${input.contractId}`,
            },
          ],
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      ),
    );

    const orderId = resp.data.id as string;
    this.logger.log(
      `PayPal Order creado: ${orderId} | tenant: ${input.tenantId}`,
    );

    return {
      success: true,
      transaction_id: orderId,
      processor_fee: processorFee,
      status: 'PROCESSING',
    };
  }

  async confirmPayment(transactionId: string): Promise<ProcessorResult> {
    const token = await this.getAccessToken();

    const resp = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v2/checkout/orders/${transactionId}/capture`,
        {},
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      ),
    );

    const status = resp.data.status as string;
    const captures: Array<{ id: string }> =
      resp.data.purchase_units?.[0]?.payments?.captures ?? [];
    const captureId = captures[0]?.id ?? transactionId;

    return {
      success: status === 'COMPLETED',
      transaction_id: captureId,
      processor_fee: 0,
      status: status === 'COMPLETED' ? 'APPROVED' : 'FAILED',
    };
  }

  async refundPayment(
    captureId: string,
    amount: number,
  ): Promise<ProcessorResult> {
    const token = await this.getAccessToken();

    const resp = await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v2/payments/captures/${captureId}/refund`,
        {
          amount: {
            value: amount.toFixed(2),
            currency_code: 'USD',
          },
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 30000,
        },
      ),
    );

    const refundStatus = resp.data.status as string;

    return {
      success: refundStatus === 'COMPLETED',
      transaction_id: resp.data.id as string,
      processor_fee: 0,
      status: refundStatus === 'COMPLETED' ? 'APPROVED' : 'FAILED',
    };
  }

  /**
   * Verifica la firma del webhook con la API de PayPal y procesa el evento.
   * @param payload    Cuerpo del request (ya parseado como JSON)
   * @param signature  Headers de PayPal serializados como JSON string
   */
  async handleWebhook(
    payload: unknown,
    signature?: string,
  ): Promise<WebhookResult> {
    if (this.webhookId && signature) {
      await this.verifyPayPalWebhook(payload, signature);
    }

    const event = payload as Record<string, unknown>;
    const eventType = event.event_type as string;
    const resource = (event.resource ?? {}) as Record<string, unknown>;

    this.logger.log(`PayPal webhook recibido: ${eventType}`);

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        return {
          transaction_id: resource.id as string,
          status: 'APPROVED',
          raw_event: payload,
        };
      case 'PAYMENT.CAPTURE.DENIED':
      case 'PAYMENT.CAPTURE.DECLINED':
        return {
          transaction_id: resource.id as string,
          status: 'FAILED',
          raw_event: payload,
        };
      case 'PAYMENT.CAPTURE.REFUNDED':
        return {
          transaction_id: resource.id as string,
          status: 'APPROVED',
          raw_event: payload,
        };
      default:
        this.logger.debug(
          `PayPal webhook: evento no manejado — ${eventType}`,
        );
        return { status: 'APPROVED', raw_event: payload };
    }
  }

  private async verifyPayPalWebhook(
    payload: unknown,
    headersJson: string,
  ): Promise<void> {
    const token = await this.getAccessToken();
    const headers = JSON.parse(headersJson) as Record<string, string>;

    await firstValueFrom(
      this.httpService.post(
        `${this.baseUrl}/v1/notifications/verify-webhook-signature`,
        {
          auth_algo: headers['paypal-auth-algo'],
          cert_url: headers['paypal-cert-url'],
          transmission_id: headers['paypal-transmission-id'],
          transmission_sig: headers['paypal-transmission-sig'],
          transmission_time: headers['paypal-transmission-time'],
          webhook_id: this.webhookId,
          webhook_event: payload,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      ),
    );
  }
}
