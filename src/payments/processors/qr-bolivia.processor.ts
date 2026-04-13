import { Injectable, NotImplementedException } from '@nestjs/common';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/**
 * Procesador QR Bolivia (MC4/SIP) — estructura lista para conectar con QrPaymentService.
 *
 * La lógica real de generación de QR ya existe en:
 *   src/payments/qr/qr-payment.service.ts
 *
 * Para activar:
 *   1. Inyectar QrPaymentService aquí
 *   2. Agregar MC4_AUTH_URL, MC4_QR_URL, MC4_STATUS_URL, MC4_API_KEY_AUTH,
 *      MC4_API_KEY_SERVICIO, MC4_USERNAME, MC4_PASSWORD al .env
 *   3. Reemplazar cada NotImplementedException delegando a QrPaymentService
 *
 * Documentación interna: ver qr-payment.service.ts y PAGOS.md
 */
@Injectable()
export class QRBoliviaProcessor implements IPaymentProcessor {
  readonly processorName = 'qr_bolivia';

  // TODO: inyectar QrPaymentService aquí
  // constructor(private readonly qrService: QrPaymentService) {}

  async createPayment(
    _input: ProcessorPaymentInput,
  ): Promise<ProcessorResult> {
    // TODO: delegar a QrPaymentService.generarQrDinamico()
    // El QR se genera con el alias del sistema (QR365T...) y se guarda en qr_payments.
    // El resultado incluye la imagen base64 del QR para mostrar al usuario.
    // return {
    //   success: true,
    //   transaction_id: alias,
    //   processor_fee: 0,
    //   status: 'PENDING', // El pago queda PENDIENTE hasta que el banco confirme
    // };
    throw new NotImplementedException(
      'QR Bolivia no está configurado. Agrega las variables MC4_* al .env e implementa este método.',
    );
  }

  async confirmPayment(
    _transactionId: string,
  ): Promise<ProcessorResult> {
    // TODO: delegar a QrPaymentService.verificarEstadoQr()
    // El alias del QR actúa como transactionId.
    throw new NotImplementedException('QR Bolivia: confirmPayment no implementado');
  }

  async refundPayment(
    _transactionId: string,
    _amount: number,
  ): Promise<ProcessorResult> {
    // QR Bolivia (MC4/SIP) no soporta reembolsos automáticos vía API.
    // Los reembolsos se gestionan manualmente con el banco.
    throw new NotImplementedException(
      'QR Bolivia no soporta reembolsos automáticos. Gestionar manualmente con el banco.',
    );
  }

  async handleWebhook(
    payload: unknown,
    _signature?: string,
  ): Promise<WebhookResult> {
    // TODO: delegar a QrPaymentService.handleCallback()
    // El banco MC4/SIP envía un callback cuando el pago es confirmado.
    // La verificación de firma ya está implementada en handleCallback().
    // return await this.qrService.handleCallback(slug, payload as QrCallbackDto);
    throw new NotImplementedException('QR Bolivia: handleWebhook no implementado');
  }
}
