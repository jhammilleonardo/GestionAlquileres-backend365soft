import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentMethod, PaymentMethodLabels } from './enums';
import { resolvePaymentMethodLabel } from './payment-method-catalog';
import { TenantsService } from '../tenants/tenants.service';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class PaymentMethodsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async getAvailablePaymentMethods(
    tenantSlug: string,
  ): Promise<{ method: string; label: string }[]> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);

    const config = await this.dataSource.query<{ payment_methods: unknown }[]>(
      `SELECT payment_methods FROM ${quoteIdent(tenant.schema_name)}.tenant_config LIMIT 1`,
    );

    if (config.length === 0 || !config[0].payment_methods) {
      return this.getAllPaymentMethods();
    }

    const configured = this.parseConfiguredPaymentMethods(
      config[0].payment_methods,
    );

    // Conserva el código configurado tal cual (PaymentProcessorFactory resuelve
    // el procesador a partir de él) y solo deriva la etiqueta legible. No se
    // filtra contra el enum: los códigos regionales (qr_accl, transferencia…)
    // no pertenecen al enum y filtrarlos dejaba el formulario de pago vacío.
    const seen = new Set<string>();
    const unique = configured
      .map((method) => method.trim())
      .filter((method) => {
        const key = method.toLowerCase();
        if (method.length === 0 || seen.has(key)) {
          return false;
        }
        seen.add(key);
        return true;
      });

    return unique.map((method) => ({
      method,
      label: resolvePaymentMethodLabel(method),
    }));
  }

  private getAllPaymentMethods(): { method: string; label: string }[] {
    return Object.values(PaymentMethod).map((method) => ({
      method,
      label: PaymentMethodLabels[method],
    }));
  }

  private parseConfiguredPaymentMethods(value: unknown): string[] {
    if (Array.isArray(value)) {
      return value.filter(
        (method): method is string => typeof method === 'string',
      );
    }

    if (typeof value !== 'string') {
      return [];
    }

    try {
      const parsed: unknown = JSON.parse(value);
      return Array.isArray(parsed)
        ? parsed.filter(
            (method): method is string => typeof method === 'string',
          )
        : [];
    } catch {
      return [];
    }
  }
}
