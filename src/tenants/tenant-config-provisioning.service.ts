import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantCountry } from './dto/create-tenant.dto';

interface TenantConfigDefaults {
  currency: string;
  language: string;
  timezone: string;
  date_format: string;
  rental_type: string;
  payment_methods: string[];
  notification_channels: {
    email: boolean;
    whatsapp: boolean;
    internal: boolean;
  };
  commission_percentage: number;
  grace_days_late_fee: number;
  late_fee_percentage: number;
}

@Injectable()
export class TenantConfigProvisioningService {
  private readonly defaultsByCountry: Record<
    TenantCountry,
    TenantConfigDefaults
  > = {
    [TenantCountry.US]: {
      currency: 'USD',
      language: 'en',
      timezone: 'America/New_York',
      date_format: 'MM/DD/YYYY',
      rental_type: 'LONG_TERM',
      payment_methods: ['stripe', 'ach', 'paypal'],
      notification_channels: { email: true, whatsapp: false, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 5,
    },
    [TenantCountry.BO]: {
      currency: 'BOB',
      language: 'es',
      timezone: 'America/La_Paz',
      date_format: 'DD/MM/YYYY',
      rental_type: 'BOTH',
      payment_methods: ['qr_accl', 'transferencia'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 10,
      grace_days_late_fee: 5,
      late_fee_percentage: 2,
    },
    [TenantCountry.GT]: {
      currency: 'GTQ',
      language: 'es',
      timezone: 'America/Guatemala',
      date_format: 'DD/MM/YYYY',
      rental_type: 'BOTH',
      payment_methods: ['stripe', 'payu', 'tarjeta'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 3,
    },
    [TenantCountry.HN]: {
      currency: 'HNL',
      language: 'es',
      timezone: 'America/Tegucigalpa',
      date_format: 'DD/MM/YYYY',
      rental_type: 'LONG_TERM',
      payment_methods: ['payu', 'tarjeta', 'transferencia'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 3,
    },
  };

  constructor(private readonly dataSource: DataSource) {}

  async ensureTenantConfig(
    schemaName: string,
    country: TenantCountry = TenantCountry.BO,
  ): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.tenant_config (
        id SERIAL PRIMARY KEY,
        country VARCHAR(2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        language VARCHAR(2) NOT NULL,
        timezone VARCHAR(100) NOT NULL,
        date_format VARCHAR(20) NOT NULL,
        rental_type VARCHAR(20) NOT NULL,
        payment_methods JSONB NOT NULL DEFAULT '[]',
        notification_channels JSONB NOT NULL DEFAULT '{"email": true, "whatsapp": false, "internal": true}',
        commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
        grace_days_late_fee INTEGER NOT NULL DEFAULT 0,
        late_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
        custom_expense_categories JSONB NOT NULL DEFAULT '[]',
        setup_completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    const defaults = this.defaultsByCountry[country];

    await this.dataSource.query(
      `
      INSERT INTO ${q}.tenant_config (
        country, currency, language, timezone, date_format,
        rental_type, payment_methods, notification_channels,
        commission_percentage, grace_days_late_fee, late_fee_percentage, setup_completed
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false
      WHERE NOT EXISTS (SELECT 1 FROM ${q}.tenant_config);
      `,
      [
        country,
        defaults.currency,
        defaults.language,
        defaults.timezone,
        defaults.date_format,
        defaults.rental_type,
        JSON.stringify(defaults.payment_methods),
        JSON.stringify(defaults.notification_channels),
        defaults.commission_percentage,
        defaults.grace_days_late_fee,
        defaults.late_fee_percentage,
      ],
    );
  }
}
