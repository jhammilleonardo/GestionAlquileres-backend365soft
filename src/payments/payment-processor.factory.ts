import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IPaymentProcessor } from './processors/payment-processor.interface';
import { ManualPaymentProcessor } from './processors/manual.processor';
import { StripeProcessor } from './processors/stripe.processor';
import { PayPalProcessor } from './processors/paypal.processor';
import { PayUProcessor } from './processors/payu.processor';
import { QRBoliviaProcessor } from './processors/qr-bolivia.processor';
import { quoteIdent } from '../common/utils/sql-identifier';

/** Métodos de pago que usan Stripe como procesador (EE.UU., Guatemala) */
const STRIPE_METHODS = new Set(['stripe', 'ach']);

/** Métodos de pago que usan PayPal como procesador (EE.UU.) */
const PAYPAL_METHODS = new Set(['paypal']);

/** Métodos de pago que usan PayU como procesador (Guatemala, Honduras) */
const PAYU_METHODS = new Set(['payu', 'tarjeta']);

/** Métodos de pago que usan QR Bolivia como procesador */
const QR_BOLIVIA_METHODS = new Set(['qr_accl', 'qr_mc4']);

/**
 * Factory que selecciona el procesador de pago correcto para un tenant.
 *
 * Lógica de selección:
 *   1. Lee tenant_config.payment_methods del schema activo
 *   2. Compara el método solicitado contra los grupos de procesadores
 *   3. Si el método no está configurado para el tenant → ManualPaymentProcessor (fallback seguro)
 *
 * Agregar un nuevo procesador:
 *   1. Implementar IPaymentProcessor en processors/
 *   2. Añadir los métodos al Set correspondiente (o crear uno nuevo)
 *   3. Inyectar el nuevo procesador en el constructor y devolver en resolve()
 */
@Injectable()
export class PaymentProcessorFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly manualProcessor: ManualPaymentProcessor,
    private readonly stripeProcessor: StripeProcessor,
    private readonly paypalProcessor: PayPalProcessor,
    private readonly payuProcessor: PayUProcessor,
    private readonly qrBoliviaProcessor: QRBoliviaProcessor,
  ) {}

  /**
   * Devuelve el procesador adecuado según el método de pago y la configuración del tenant.
   *
   * @param paymentMethod  Método de pago del DTO (ej: 'stripe', 'paypal', 'payu', 'qr_accl')
   * @param tenantSlug     Slug del tenant para leer su configuración
   */
  async resolve(
    paymentMethod: string,
    tenantSlug: string,
  ): Promise<IPaymentProcessor> {
    const configuredMethods = await this.getTenantPaymentMethods(tenantSlug);
    const methodLower = paymentMethod.toLowerCase();

    if (!configuredMethods.includes(methodLower)) {
      return this.manualProcessor;
    }

    if (STRIPE_METHODS.has(methodLower)) return this.stripeProcessor;
    if (PAYPAL_METHODS.has(methodLower)) return this.paypalProcessor;
    if (PAYU_METHODS.has(methodLower)) return this.payuProcessor;
    if (QR_BOLIVIA_METHODS.has(methodLower)) return this.qrBoliviaProcessor;

    // Transferencia, efectivo, cheque y cualquier método manual
    return this.manualProcessor;
  }

  private async getTenantPaymentMethods(tenantSlug: string): Promise<string[]> {
    try {
      const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

      const rows: { payment_methods: string[] | string }[] =
        await this.dataSource.query(
          `SELECT payment_methods FROM ${quoteIdent(schemaName)}.tenant_config LIMIT 1`,
        );

      if (rows.length === 0) return [];

      const methods = rows[0].payment_methods;

      if (Array.isArray(methods)) {
        return methods.map((m) => String(m).toLowerCase());
      }

      if (typeof methods === 'string') {
        const parsed: unknown = JSON.parse(methods);
        if (Array.isArray(parsed)) {
          return parsed.map((m) => String(m).toLowerCase());
        }
      }

      return [];
    } catch {
      return [];
    }
  }
}
