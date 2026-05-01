/**
 * Input que todo procesador de pago recibe para iniciar una transacción.
 */
export interface ProcessorPaymentInput {
  amount: number;
  currency: string;
  tenantId: number;
  contractId: number;
  propertyId: number;
  reference_number?: string;
  notes?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Resultado estándar que devuelve cualquier operación de procesador.
 */
export interface ProcessorResult {
  success: boolean;
  /** ID de transacción devuelto por el procesador externo */
  transaction_id?: string;
  /** Comisión cobrada por el procesador (en la misma moneda) */
  processor_fee: number;
  status: 'PENDING' | 'PROCESSING' | 'APPROVED' | 'FAILED';
  /** Mensaje de error si success = false */
  error?: string;
}

/**
 * Resultado al procesar un webhook / callback del procesador.
 */
export interface WebhookResult {
  payment_id?: number;
  transaction_id?: string;
  status: 'APPROVED' | 'REJECTED' | 'FAILED';
  raw_event: unknown;
}

/**
 * Contrato que debe implementar cada procesador de pago.
 * Conectar un nuevo procesador = implementar esta interfaz, sin tocar PaymentsService.
 */
export interface IPaymentProcessor {
  /** Nombre identificador del procesador (ej: 'manual', 'stripe', 'qr_bolivia') */
  readonly processorName: string;

  /**
   * Inicia el proceso de pago con el proveedor externo.
   * Para pagos manuales devuelve PENDING (requiere aprobación del admin).
   * Para procesadores automáticos puede devolver PROCESSING o APPROVED.
   */
  createPayment(input: ProcessorPaymentInput): Promise<ProcessorResult>;

  /**
   * Confirma / captura una transacción previamente iniciada.
   * Usado después de autorización en flujos de dos pasos (ej: Stripe PaymentIntent).
   */
  confirmPayment(transactionId: string): Promise<ProcessorResult>;

  /**
   * Solicita el reembolso parcial o total de una transacción aprobada.
   */
  refundPayment(
    transactionId: string,
    amount: number,
  ): Promise<ProcessorResult>;

  /**
   * Procesa el webhook / callback que envía el proveedor externo.
   * @param payload  - Cuerpo del request (ya parseado)
   * @param signature - Cabecera de firma del proveedor (Stripe-Signature, etc.)
   */
  handleWebhook(payload: unknown, signature?: string): Promise<WebhookResult>;
}
