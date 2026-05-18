import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { PaymentMethod, PaymentMethodLabels } from './enums';
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
    const validMethods = Object.values(PaymentMethod);

    return configured
      .filter((method) => validMethods.includes(method as PaymentMethod))
      .map((method) => ({
        method,
        label: PaymentMethodLabels[method as PaymentMethod],
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
