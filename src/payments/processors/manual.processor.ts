import { Injectable } from '@nestjs/common';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/**
 * Procesador manual: el admin verifica el comprobante y aprueba/rechaza el pago.
 * Es el procesador activo mientras no haya integración con un gateway real.
 *
 * Flujo:
 *   1. createPayment()  → PENDING  (inquilino sube comprobante)
 *   2. Admin revisa     → aprueba o rechaza manualmente desde el panel
 *   3. confirmPayment() → APPROVED (se llama cuando el admin aprueba)
 *   4. refundPayment()  → registra la devolución manualmente
 */
@Injectable()
export class ManualPaymentProcessor implements IPaymentProcessor {
  readonly processorName = 'manual';

  createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult> {
    return Promise.resolve({
      success: true,
      transaction_id: `MAN-${input.tenantId}-${Date.now()}`,
      processor_fee: 0,
      status: 'PENDING',
    });
  }

  confirmPayment(transactionId: string): Promise<ProcessorResult> {
    void transactionId;

    return Promise.resolve({
      success: true,
      processor_fee: 0,
      status: 'APPROVED',
    });
  }

  refundPayment(
    transactionId: string,
    amount: number,
  ): Promise<ProcessorResult> {
    void transactionId;
    void amount;

    return Promise.resolve({
      success: true,
      processor_fee: 0,
      status: 'APPROVED',
    });
  }

  handleWebhook(payload: unknown): Promise<WebhookResult> {
    // El procesador manual no recibe webhooks externos.
    // Esta implementación existe para cumplir el contrato de la interfaz.
    return Promise.resolve({
      status: 'APPROVED',
      raw_event: payload,
    });
  }
}
