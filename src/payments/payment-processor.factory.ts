import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { IPaymentProcessor } from './processors/payment-processor.interface';
import { ManualPaymentProcessor } from './processors/manual.processor';
import { StripeProcessor } from './processors/stripe.processor';
import { QRBoliviaProcessor } from './processors/qr-bolivia.processor';
import { quoteIdent } from '../common/utils/sql-identifier';

/** Métodos de pago que usan Stripe como procesador subyacente */
const STRIPE_METHODS = new Set(['stripe', 'ach', 'paypal']);

/** Métodos de pago que usan QR Bolivia como procesador subyacente */
const QR_BOLIVIA_METHODS = new Set(['qr_accl', 'qr_mc4']);

/**
 * Factory que selecciona el procesador de pago correcto para un tenant.
 *
 * Lógica de selección:
 *   1. Lee tenant_config.payment_methods del schema activo (ya establecido por TenantContextMiddleware)
 *   2. Compara el método de pago solicitado contra los grupos de procesadores
 *   3. Si el método no está configurado para el tenant → ManualPaymentProcessor como fallback seguro
 *
 * Agregar un nuevo procesador:
 *   1. Implementar IPaymentProcessor en processors/
 *   2. Añadir el método al Set correspondiente (o crear uno nuevo)
 *   3. Inyectar el nuevo procesador aquí y devolver en resolve()
 */
@Injectable()
export class PaymentProcessorFactory {
  constructor(
    private readonly dataSource: DataSource,
    private readonly manualProcessor: ManualPaymentProcessor,
    private readonly stripeProcessor: StripeProcessor,
    private readonly qrBoliviaProcessor: QRBoliviaProcessor,
  ) {}

  /**
   * Devuelve el procesador adecuado según el método de pago y la configuración del tenant.
   *
   * @param paymentMethod  Método de pago del DTO (ej: 'stripe', 'qr_accl', 'transferencia')
   * @param tenantSlug     Slug del tenant para leer su configuración
   */
  async resolve(
    paymentMethod: string,
    tenantSlug: string,
  ): Promise<IPaymentProcessor> {
    const configuredMethods = await this.getTenantPaymentMethods(tenantSlug);

    const methodLower = paymentMethod.toLowerCase();

    // El método debe estar en la lista configurada para el tenant
    if (!configuredMethods.includes(methodLower)) {
      return this.manualProcessor;
    }

    if (STRIPE_METHODS.has(methodLower)) {
      return this.stripeProcessor;
    }

    if (QR_BOLIVIA_METHODS.has(methodLower)) {
      return this.qrBoliviaProcessor;
    }

    // Transferencia, efectivo, cheque y cualquier método manual
    return this.manualProcessor;
  }

  /**
   * Lee payment_methods de tenant_config en el schema activo.
   * El search_path ya está establecido por TenantContextMiddleware.
   */
  private async getTenantPaymentMethods(tenantSlug: string): Promise<string[]> {
    try {
      // Construir nombre de schema a partir del slug (misma lógica que TenantsService)
      const schemaName = `tenant_${tenantSlug.replace(/-/g, '_')}`;

      const rows: { payment_methods: string[] | string }[] =
        await this.dataSource.query(
          `SELECT payment_methods FROM ${quoteIdent(schemaName)}.tenant_config LIMIT 1`,
        );

      if (rows.length === 0) return [];

      const methods = rows[0].payment_methods;

      // payment_methods se guarda como JSONB — puede llegar como array o como string
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
      // Si no se puede leer la config, fallback a manual (seguro)
      return [];
    }
  }
}
