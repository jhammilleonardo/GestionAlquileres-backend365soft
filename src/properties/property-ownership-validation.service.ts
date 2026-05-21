import { BadRequestException, Injectable } from '@nestjs/common';
import { QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AssignOwnerDto } from './dto/create-property.dto';

interface OwnershipTotalRow {
  total: string | number | null;
}

@Injectable()
export class PropertyOwnershipValidationService {
  assertAtMostOnePrimary(primaryCount: number): void {
    if (primaryCount > 1) {
      throw new BadRequestException(
        'Only one primary owner can be assigned to a property',
      );
    }
  }

  assertProvidedOwnershipWithinLimit(owners: AssignOwnerDto[]): void {
    const total = owners.reduce(
      (sum, owner) => sum + (owner.ownership_percentage ?? 0),
      0,
    );
    if (total > 100) {
      throw new BadRequestException(
        'Total ownership percentage cannot exceed 100',
      );
    }
  }

  async assertOwnershipTotalWithinLimit(
    queryRunner: QueryRunner,
    propertyId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const rows = (await queryRunner.query(
      `SELECT COALESCE(SUM(ownership_percentage), 0) AS total
       FROM ${schemaPrefix}property_owners
       WHERE property_id = $1`,
      [propertyId],
    )) as OwnershipTotalRow[];

    const total = Number(rows[0]?.total ?? 0);
    if (total > 100) {
      throw new BadRequestException(
        'Total ownership percentage cannot exceed 100',
      );
    }
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
