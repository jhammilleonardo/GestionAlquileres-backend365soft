import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class ContractHistoryService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async logChange(params: {
    contractId: number;
    field: string;
    oldValue: unknown;
    newValue: unknown;
    userId: number;
    reason?: string;
    schemaName?: string | null;
    queryRunner?: QueryRunner;
  }): Promise<void> {
    const schemaPrefix = params.schemaName
      ? `${quoteIdent(params.schemaName)}.`
      : '';
    const executor = params.queryRunner ?? this.dataSource;

    await executor.query(
      `INSERT INTO ${schemaPrefix}contract_history
       (contract_id, field_modified, old_value, new_value, modified_by, reason, change_date)
       VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
      [
        params.contractId,
        params.field,
        params.oldValue || null,
        params.newValue || null,
        params.userId,
        params.reason || null,
      ],
    );
  }
}
