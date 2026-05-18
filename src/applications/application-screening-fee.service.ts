import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';
import { ApplicationQueriesService } from './application-queries.service';

@Injectable()
export class ApplicationScreeningFeeService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly applicationQueriesService: ApplicationQueriesService,
    private readonly tenantsService: TenantsService,
  ) {}

  async markPaid(id: number, tenantSlug: string): Promise<{ message: string }> {
    const schemaName = await this.getTenantSchemaName(tenantSlug);
    const schemaPrefix = this.schemaPrefix(schemaName);
    await this.applicationQueriesService.findOne(id, tenantSlug);

    await this.dataSource.query(
      `UPDATE ${schemaPrefix}rental_applications SET screening_fee_paid = TRUE, updated_at = NOW() WHERE id = $1`,
      [id],
    );

    return { message: 'Pago de screening registrado' };
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(tenantSlug);
    return tenant.schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
