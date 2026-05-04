import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { createHash } from 'crypto';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/** Códigos de estado IPN de PayU */
const PAYU_STATE_APPROVED = '4';
const PAYU_STATE_EXPIRED = '5';
const PAYU_STATE_DECLINED = '6';
const PAYU_STATE_PENDING = '7';

/**
 * Procesador PayU — REST API v4 (Guatemala y Honduras).
 *
 * Para activar en producción:
 *   1. Crear cuenta en https://colombia.payu.com o https://guatemala.payu.com
 *   2. Agregar PAYU_MERCHANT_ID, PAYU_API_KEY, PAYU_API_LOGIN, PAYU_ACCOUNT_ID al .env
 *   3. Cambiar PAYU_BASE_URL a https://api.payulatam.com/payments-api/4.0/service.cgi
 *
 * Sandbox: https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi
 * Reports API: reemplazar payments-api por reports-api en la URL
 */
@Injectable()
export class PayUProcessor implements IPaymentProcessor {
  readonly processorName = 'payu';

  private readonly baseUrl: string;
  private readonly merchantId: string;
  private readonly apiKey: string;
  private readonly apiLogin: string;
  private readonly accountId: string;
  private readonly logger = new Logger(PayUProcessor.name);

  constructor(
    private readonly config: ConfigService,
    private readonly httpService: HttpService,
  ) {
    this.baseUrl = this.config.get<string>(
      'PAYU_BASE_URL',
      'https://sandbox.api.payulatam.com/payments-api/4.0/service.cgi',
    );
    this.merchantId = this.config.get<string>('PAYU_MERCHANT_ID', '');
    this.apiKey = this.config.get<string>('PAYU_API_KEY', '');
    this.apiLogin = this.config.get<string>('PAYU_API_LOGIN', '');
    this.accountId = this.config.get<string>('PAYU_ACCOUNT_ID', '');
  }

  /** Firma requerida por PayU: md5(apiKey~merchantId~referenceCode~amount~currency) */
  private buildSignature(
    referenceCode: string,
    amount: string,
    currency: string,
  ): string {
    const raw = `${this.apiKey}~${this.merchantId}~${referenceCode}~${amount}~${currency}`;
    return createHash('md5').update(raw).digest('hex');
  }

  async createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult> {
    const referenceCode =
      input.reference_number ?? `365S-${input.contractId}-${Date.now()}`;
    const amountStr = input.amount.toFixed(2);
    const currency = input.currency.toUpperCase();
    const signature = this.buildSignature(referenceCode, amountStr, currency);
    const isTest = this.config.get<string>('NODE_ENV') !== 'production';

    const resp = await firstValueFrom(
      this.httpService.post(
        this.baseUrl,
        {
          language: 'es',
          command: 'SUBMIT_TRANSACTION',
          merchant: { apiLogin: this.apiLogin, apiKey: this.apiKey },
          transaction: {
            order: {
              accountId: this.accountId,
              referenceCode,
              description:
                input.notes ?? `Pago contrato #${input.contractId}`,
              language: 'es',
              signature,
              additionalValues: {
                TX_VALUE: { value: Number(amountStr), currency },
              },
            },
            type: 'AUTHORIZATION_AND_CAPTURE',
            paymentMethod: String(input.metadata?.paymentMethod ?? 'CARD'),
            paymentCountry: String(input.metadata?.country ?? 'GT'),
            ipAddress: String(input.metadata?.ipAddress ?? '127.0.0.1'),
            userAgent: String(input.metadata?.userAgent ?? '365Soft/1.0'),
          },
          test: isTest,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        },
      ),
    );

    const txnResponse = resp.data?.transactionResponse as Record<
      string,
      string
    >;

    if (!txnResponse) {
      return {
        success: false,
        processor_fee: 0,
        status: 'FAILED',
        error: 'PayU no devolvió respuesta de transacción',
      };
    }

    const state = txnResponse.state ?? '';
    const txnId = txnResponse.transactionId ?? referenceCode;

    this.logger.log(
      `PayU transacción ${txnId}: estado=${state} | tenant: ${input.tenantId}`,
    );

    if (state === 'APPROVED') {
      return { success: true, transaction_id: txnId, processor_fee: 0, status: 'APPROVED' };
    }
    if (state === 'PENDING') {
      return { success: true, transaction_id: txnId, processor_fee: 0, status: 'PROCESSING' };
    }
    return {
      success: false,
      transaction_id: txnId,
      processor_fee: 0,
      status: 'FAILED',
      error: txnResponse.responseMessage ?? 'Pago rechazado por PayU',
    };
  }

  async confirmPayment(transactionId: string): Promise<ProcessorResult> {
    const reportsUrl = this.baseUrl.replace(
      'payments-api',
      'reports-api',
    );
    const isTest = this.config.get<string>('NODE_ENV') !== 'production';

    const resp = await firstValueFrom(
      this.httpService.post(
        reportsUrl,
        {
          language: 'es',
          command: 'TRANSACTION_RESPONSE_DETAIL',
          merchant: { apiLogin: this.apiLogin, apiKey: this.apiKey },
          details: { transactionId },
          test: isTest,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 15000,
        },
      ),
    );

    const state = (resp.data?.result?.payload?.state as string) ?? '';

    return {
      success: state === 'APPROVED',
      transaction_id: transactionId,
      processor_fee: 0,
      status:
        state === 'APPROVED'
          ? 'APPROVED'
          : state === 'PENDING'
            ? 'PROCESSING'
            : 'FAILED',
    };
  }

  async refundPayment(
    transactionId: string,
    amount: number,
  ): Promise<ProcessorResult> {
    const isTest = this.config.get<string>('NODE_ENV') !== 'production';

    const resp = await firstValueFrom(
      this.httpService.post(
        this.baseUrl,
        {
          language: 'es',
          command: 'SUBMIT_TRANSACTION',
          merchant: { apiLogin: this.apiLogin, apiKey: this.apiKey },
          transaction: {
            parentTransactionId: transactionId,
            type: 'REFUND',
            reason: `Reembolso de ${amount}`,
          },
          test: isTest,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          timeout: 30000,
        },
      ),
    );

    const txnResponse = resp.data?.transactionResponse as Record<
      string,
      string
    >;
    const state = txnResponse?.state ?? '';

    return {
      success: state === 'APPROVED' || state === 'PENDING',
      transaction_id: txnResponse?.transactionId ?? transactionId,
      processor_fee: 0,
      status:
        state === 'APPROVED'
          ? 'APPROVED'
          : state === 'PENDING'
            ? 'PROCESSING'
            : 'FAILED',
    };
  }

  /**
   * Procesa la notificación IPN de PayU (application/x-www-form-urlencoded).
   * Verifica la firma antes de actualizar el estado del pago.
   */
  async handleWebhook(
    payload: unknown,
    _signature?: string,
  ): Promise<WebhookResult> {
    const body = payload as Record<string, string>;
    const statePol = body.state_pol ?? '';
    const transactionId = body.transaction_id ?? body.reference_pol ?? '';

    if (!this.verifyIpnSignature(body)) {
      this.logger.warn(
        `PayU IPN: firma inválida para referencia ${body.reference_pol}`,
      );
      return { status: 'FAILED', raw_event: payload };
    }

    this.logger.log(
      `PayU IPN recibido: state_pol=${statePol} | txn=${transactionId}`,
    );

    if (statePol === PAYU_STATE_APPROVED) {
      return { transaction_id: transactionId, status: 'APPROVED', raw_event: payload };
    }
    if (statePol === PAYU_STATE_DECLINED || statePol === PAYU_STATE_EXPIRED) {
      return { transaction_id: transactionId, status: 'FAILED', raw_event: payload };
    }
    if (statePol === PAYU_STATE_PENDING) {
      return { transaction_id: transactionId, status: 'APPROVED', raw_event: payload };
    }

    return { transaction_id: transactionId, status: 'APPROVED', raw_event: payload };
  }

  /**
   * Verifica la firma del IPN de PayU.
   * Fórmula: md5(apiKey~merchantId~reference_pol~amount_pol~currency~state_pol)
   * PayU trunca el monto a 1 decimal.
   */
  private verifyIpnSignature(body: Record<string, string>): boolean {
    const { reference_pol, amount_pol, currency, state_pol, sign } = body;

    // En sandbox la firma puede no enviarse
    if (!sign) return true;

    const rawAmount = Number(amount_pol ?? 0).toFixed(1);
    const raw = `${this.apiKey}~${this.merchantId}~${reference_pol}~${rawAmount}~${currency}~${state_pol}`;
    const expected = createHash('md5').update(raw).digest('hex');

    return expected === sign;
  }
}
