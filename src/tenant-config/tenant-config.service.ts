import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';
import { quoteIdent } from '../common/utils/sql-identifier';

export interface TenantConfigRow {
  id: number;
  country: string;
  currency: string;
  language: string;
  timezone: string;
  date_format: string;
  rental_type: string;
  payment_methods: unknown;
  notification_channels: unknown;
  commission_percentage: string | number;
  grace_days_late_fee: number;
  late_fee_percentage: string | number;
  custom_expense_categories?: unknown;
  setup_completed?: boolean;
  created_at?: Date;
  updated_at?: Date;
}

@Injectable()
export class TenantConfigService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getConfig(schemaName: string): Promise<TenantConfigRow> {
    const rows = await this.dataSource.query<TenantConfigRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.tenant_config LIMIT 1`,
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException('Tenant config not found');
    }

    return rows[0];
  }

  async updateConfig(
    schemaName: string,
    dto: UpdateTenantConfigDto,
  ): Promise<TenantConfigRow> {
    const config = await this.getConfig(schemaName);

    const fields: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (dto.country !== undefined) {
      fields.push(`country = $${idx++}`);
      values.push(dto.country);
    }
    if (dto.currency !== undefined) {
      fields.push(`currency = $${idx++}`);
      values.push(dto.currency);
    }
    if (dto.language !== undefined) {
      fields.push(`language = $${idx++}`);
      values.push(dto.language);
    }
    if (dto.timezone !== undefined) {
      fields.push(`timezone = $${idx++}`);
      values.push(dto.timezone);
    }
    if (dto.date_format !== undefined) {
      fields.push(`date_format = $${idx++}`);
      values.push(dto.date_format);
    }
    if (dto.rental_type !== undefined) {
      fields.push(`rental_type = $${idx++}`);
      values.push(dto.rental_type);
    }
    if (dto.payment_methods !== undefined) {
      fields.push(`payment_methods = $${idx++}`);
      values.push(JSON.stringify(dto.payment_methods));
    }
    if (dto.notification_channels !== undefined) {
      fields.push(`notification_channels = $${idx++}`);
      values.push(JSON.stringify(dto.notification_channels));
    }
    if (dto.commission_percentage !== undefined) {
      fields.push(`commission_percentage = $${idx++}`);
      values.push(dto.commission_percentage);
    }
    if (dto.grace_days_late_fee !== undefined) {
      fields.push(`grace_days_late_fee = $${idx++}`);
      values.push(dto.grace_days_late_fee);
    }
    if (dto.late_fee_percentage !== undefined) {
      fields.push(`late_fee_percentage = $${idx++}`);
      values.push(dto.late_fee_percentage);
    }
    if (dto.custom_expense_categories !== undefined) {
      fields.push(`custom_expense_categories = $${idx++}`);
      values.push(JSON.stringify(dto.custom_expense_categories));
    }

    if (fields.length === 0) {
      return config;
    }

    fields.push(`updated_at = now()`);
    values.push(config.id);

    const rows = await this.dataSource.query<TenantConfigRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_config SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    return rows[0];
  }

  async markSetupComplete(schemaName: string): Promise<TenantConfigRow> {
    const config = await this.getConfig(schemaName);

    const rows = await this.dataSource.query<TenantConfigRow[]>(
      `UPDATE ${quoteIdent(schemaName)}.tenant_config SET setup_completed = true, updated_at = now() WHERE id = $1 RETURNING *`,
      [config.id],
    );

    return rows[0];
  }
}
