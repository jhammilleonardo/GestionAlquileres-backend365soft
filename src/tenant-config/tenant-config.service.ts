import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { UpdateTenantConfigDto } from './dto/update-tenant-config.dto';

@Injectable()
export class TenantConfigService {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  async getConfig() {
    const rows = await this.dataSource.query(
      'SELECT * FROM tenant_config LIMIT 1',
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException('Tenant config not found');
    }

    return rows[0];
  }

  async updateConfig(dto: UpdateTenantConfigDto) {
    const config = await this.getConfig();

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

    if (fields.length === 0) {
      return config;
    }

    fields.push(`updated_at = now()`);
    values.push(config.id);

    const rows = await this.dataSource.query(
      `UPDATE tenant_config SET ${fields.join(', ')} WHERE id = $${idx} RETURNING *`,
      values,
    );

    return rows[0];
  }

  async markSetupComplete() {
    const config = await this.getConfig();

    const rows = await this.dataSource.query(
      'UPDATE tenant_config SET setup_completed = true, updated_at = now() WHERE id = $1 RETURNING *',
      [config.id],
    );

    return rows[0];
  }
}
