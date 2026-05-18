import { Injectable, NotImplementedException } from '@nestjs/common';
import { QrPaymentService } from '../qr/qr-payment.service';
import { GenerateQrDto } from '../qr/dto';
import {
  IPaymentProcessor,
  ProcessorPaymentInput,
  ProcessorResult,
  WebhookResult,
} from './payment-processor.interface';

/**
 * Procesador QR Bolivia (MC4/SIP).
 *
 * Delega toda la lógica a QrPaymentService, que ya implementa el protocolo MC4.
 *
 * Convención de transactionId: "{alias}@{tenantSlug}"
 *   - Permite recuperar el slug en confirmPayment sin cambiar la interfaz.
 *   - El alias tiene el formato: QR365T{tenantId}T{timestamp}{8hex}
 *
 * Pasar en metadata.tenantSlug el slug del tenant al llamar createPayment.
 *
 * Limitación: refundPayment no está soportado por MC4/SIP — gestionar manualmente con el banco.
 */
@Injectable()
export class QRBoliviaProcessor implements IPaymentProcessor {
  readonly processorName = 'qr_bolivia';

  constructor(private readonly qrService: QrPaymentService) {}

  async createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult> {
    const slug = readMetadataString(input.metadata, 'tenantSlug', '');

    const dto: GenerateQrDto = {
      tenant_id: input.tenantId,
      amount: input.amount,
      currency: input.currency ?? 'BOB',
      contract_id: input.contractId,
      notes: input.notes,
      payment_type: readMetadataString(input.metadata, 'payment_type', 'RENT'),
    };

    const result = await this.qrService.generarQrDinamico(slug, dto);

    // Encodar slug en el transactionId para recuperarlo en confirmPayment
    const transactionId = `${result.id}@${slug}`;

    return {
      success: true,
      transaction_id: transactionId,
      processor_fee: 0,
      status: 'PENDING',
    };
  }

  async confirmPayment(transactionId: string): Promise<ProcessorResult> {
    const [qrIdStr, slug] = transactionId.split('@');
    const qrId = parseInt(qrIdStr, 10);

    const result = await this.qrService.verificarEstadoQr(slug, {
      qr_id: qrId,
    });

    const isPagado = result.status === 'PAGADO';

    return {
      success: isPagado,
      transaction_id: transactionId,
      processor_fee: 0,
      status: isPagado ? 'APPROVED' : 'PENDING',
    };
  }

  refundPayment(): Promise<ProcessorResult> {
    return Promise.reject(
      new NotImplementedException(
        'QR Bolivia (MC4/SIP) no soporta reembolsos automáticos. Gestionar manualmente con el banco.',
      ),
    );
  }

  /**
   * El callback de MC4 ya está manejado por PublicQrPaymentController en:
   *   POST /:slug/publico/qr/callback
   *
   * Este método existe para cumplir el contrato de IPaymentProcessor y no debe
   * llamarse directamente desde el WebhookController — usar el endpoint QR dedicado.
   */
  handleWebhook(payload: unknown): Promise<WebhookResult> {
    const alias = readPayloadAlias(payload);

    if (!alias) {
      return Promise.resolve({ status: 'FAILED', raw_event: payload });
    }

    return Promise.resolve({
      transaction_id: alias,
      status: 'APPROVED',
      raw_event: payload,
    });
  }
}

function readMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string,
  fallback: string,
): string {
  const value = metadata?.[key];
  return typeof value === 'string' && value.length > 0 ? value : fallback;
}

function readPayloadAlias(payload: unknown): string | null {
  if (
    typeof payload !== 'object' ||
    payload === null ||
    !('alias' in payload)
  ) {
    return null;
  }

  const alias = payload.alias;
  return typeof alias === 'string' && alias.length > 0 ? alias : null;
}
