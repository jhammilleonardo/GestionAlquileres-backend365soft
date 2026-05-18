import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantsService } from '../tenants/tenants.service';

@Injectable()
export class ContractNumberService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly tenantsService: TenantsService,
  ) {}

  async generate(
    tenantSlug?: string,
    queryRunner?: QueryRunner,
  ): Promise<string> {
    const year = new Date().getFullYear();
    let sequenceName = 'contract_number_seq';
    const executor = queryRunner ?? this.dataSource;

    if (tenantSlug) {
      const tenant = await this.tenantsService.findBySlug(tenantSlug);
      sequenceName = `${tenant.schema_name}.contract_number_seq`;
      await executor.query(
        `CREATE SEQUENCE IF NOT EXISTS ${quoteIdent(tenant.schema_name)}.contract_number_seq`,
      );
    }

    const rows = (await executor.query(
      `SELECT nextval($1::regclass)::text AS num`,
      [sequenceName],
    )) as unknown as { num: string }[];
    const nextNumber = Number(rows[0].num);

    return `CTR-${year}-${nextNumber.toString().padStart(4, '0')}`;
  }
}
