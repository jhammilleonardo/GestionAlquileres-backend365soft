import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { AssignOwnerDto, CreatePropertyDto } from './dto/create-property.dto';

interface IdRow {
  id: number;
}

interface OwnerRelationRow {
  id: number;
  is_primary: boolean;
}

interface OwnershipTotalRow {
  total: string | number | null;
}

type SqlRow = Record<string, unknown>;

@Injectable()
export class PropertyOwnersService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async attachOwnersDuringCreate(
    queryRunner: QueryRunner,
    propertyId: number,
    createPropertyDto: CreatePropertyDto,
    schemaName?: string | null,
  ): Promise<void> {
    await this.createNewOwners(
      queryRunner,
      propertyId,
      createPropertyDto,
      schemaName,
    );
    await this.assignExistingOwners(
      queryRunner,
      propertyId,
      createPropertyDto,
      schemaName,
    );
  }

  async assignOwnerToProperty(
    propertyId: number,
    assignDto: AssignOwnerDto,
    tenantSlug?: string,
  ) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await this.assertPropertyExistsWithRunner(
        queryRunner,
        propertyId,
        schemaName,
      );
      await this.assertRentalOwnerExistsWithRunner(
        queryRunner,
        assignDto.rental_owner_id,
        schemaName,
      );
      await this.lockOwnerRelations(queryRunner, propertyId, schemaName);

      if (assignDto.is_primary) {
        await this.clearPrimaryOwner(queryRunner, propertyId, schemaName);
      }

      const result = (await queryRunner.query(
        `INSERT INTO ${schemaPrefix}property_owners (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (property_id, rental_owner_id) DO UPDATE
           SET ownership_percentage = EXCLUDED.ownership_percentage,
               is_primary = EXCLUDED.is_primary
         RETURNING *`,
        [
          propertyId,
          assignDto.rental_owner_id,
          assignDto.ownership_percentage ?? 0,
          assignDto.is_primary ?? false,
        ],
      )) as SqlRow[];

      await this.assertOwnershipTotalWithinLimit(
        queryRunner,
        propertyId,
        schemaName,
      );
      await queryRunner.commitTransaction();

      return result[0];
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async removeOwnerFromProperty(
    propertyId: number,
    ownerRelationId: number,
    tenantSlug?: string,
  ) {
    const schemaName = tenantSlug
      ? await this.getTenantSchemaName(tenantSlug)
      : null;
    const schemaPrefix = this.schemaPrefix(schemaName);

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const rows = (await queryRunner.query(
        `SELECT id, is_primary FROM ${schemaPrefix}property_owners WHERE id = $1 AND property_id = $2 FOR UPDATE`,
        [ownerRelationId, propertyId],
      )) as OwnerRelationRow[];
      const relation = rows[0];

      if (!relation) {
        throw new NotFoundException(
          `Owner relation with ID ${ownerRelationId} not found for property ${propertyId}`,
        );
      }

      await this.lockOwnerRelations(queryRunner, propertyId, schemaName);
      await queryRunner.query(
        `DELETE FROM ${schemaPrefix}property_owners WHERE id = $1`,
        [ownerRelationId],
      );

      if (relation.is_primary) {
        await this.promoteFallbackPrimaryOwner(
          queryRunner,
          propertyId,
          schemaName,
        );
      }

      await queryRunner.commitTransaction();
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }

    return {
      message: 'Owner removed from property successfully',
      id: ownerRelationId,
    };
  }

  private async createNewOwners(
    queryRunner: QueryRunner,
    propertyId: number,
    createPropertyDto: CreatePropertyDto,
    schemaName?: string | null,
  ): Promise<void> {
    if (
      !createPropertyDto.new_owners ||
      createPropertyDto.new_owners.length === 0
    ) {
      return;
    }

    const existingPrimaryCount = (
      createPropertyDto.existing_owners ?? []
    ).filter((owner) => owner.is_primary).length;
    this.assertAtMostOnePrimary(existingPrimaryCount);

    for (let i = 0; i < createPropertyDto.new_owners.length; i++) {
      const ownerDto = createPropertyDto.new_owners[i];
      const schemaPrefix = this.schemaPrefix(schemaName);
      const isPrimary = existingPrimaryCount === 0 && i === 0;

      const ownerResult = (await queryRunner.query(
        `INSERT INTO ${schemaPrefix}rental_owners (name, company_name, is_company, primary_email, phone_number,
          secondary_email, secondary_phone, notes, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
         RETURNING id`,
        [
          ownerDto.name,
          ownerDto.company_name || null,
          ownerDto.is_company || null,
          ownerDto.primary_email,
          ownerDto.phone_number,
          ownerDto.secondary_email || null,
          ownerDto.secondary_phone || null,
          ownerDto.notes || null,
          true,
        ],
      )) as IdRow[];

      await queryRunner.query(
        `INSERT INTO ${schemaPrefix}property_owners (property_id, rental_owner_id, is_primary, ownership_percentage, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [propertyId, ownerResult[0].id, isPrimary, 0],
      );
    }
  }

  private async assignExistingOwners(
    queryRunner: QueryRunner,
    propertyId: number,
    createPropertyDto: CreatePropertyDto,
    schemaName?: string | null,
  ): Promise<void> {
    if (
      !createPropertyDto.existing_owners ||
      createPropertyDto.existing_owners.length === 0
    ) {
      return;
    }

    const schemaPrefix = this.schemaPrefix(schemaName);
    this.assertAtMostOnePrimary(
      createPropertyDto.existing_owners.filter((owner) => owner.is_primary)
        .length,
    );
    this.assertProvidedOwnershipWithinLimit(createPropertyDto.existing_owners);

    for (const assignDto of createPropertyDto.existing_owners) {
      await this.assertRentalOwnerExistsWithRunner(
        queryRunner,
        assignDto.rental_owner_id,
        schemaName,
      );

      await queryRunner.query(
        `INSERT INTO ${schemaPrefix}property_owners (property_id, rental_owner_id, is_primary, ownership_percentage, created_at)
         VALUES ($1, $2, $3, $4, NOW())`,
        [
          propertyId,
          assignDto.rental_owner_id,
          assignDto.is_primary || false,
          assignDto.ownership_percentage || 0,
        ],
      );
    }
  }

  private assertAtMostOnePrimary(primaryCount: number): void {
    if (primaryCount > 1) {
      throw new BadRequestException(
        'Only one primary owner can be assigned to a property',
      );
    }
  }

  private assertProvidedOwnershipWithinLimit(owners: AssignOwnerDto[]): void {
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

  private async assertPropertyExistsWithRunner(
    queryRunner: QueryRunner,
    propertyId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const props = (await queryRunner.query(
      `SELECT id FROM ${schemaPrefix}properties WHERE id = $1`,
      [propertyId],
    )) as IdRow[];
    if (props.length === 0) {
      throw new NotFoundException(`Property with ID ${propertyId} not found`);
    }
  }

  private async assertRentalOwnerExistsWithRunner(
    queryRunner: QueryRunner,
    rentalOwnerId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    const owners = (await queryRunner.query(
      `SELECT id FROM ${schemaPrefix}rental_owners WHERE id = $1`,
      [rentalOwnerId],
    )) as IdRow[];

    if (owners.length === 0) {
      throw new NotFoundException(
        `RentalOwner with ID ${rentalOwnerId} not found`,
      );
    }
  }

  private async lockOwnerRelations(
    queryRunner: QueryRunner,
    propertyId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    await queryRunner.query(
      `SELECT id FROM ${schemaPrefix}property_owners WHERE property_id = $1 FOR UPDATE`,
      [propertyId],
    );
  }

  private async clearPrimaryOwner(
    queryRunner: QueryRunner,
    propertyId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    await queryRunner.query(
      `UPDATE ${schemaPrefix}property_owners SET is_primary = false WHERE property_id = $1`,
      [propertyId],
    );
  }

  private async assertOwnershipTotalWithinLimit(
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

  private async promoteFallbackPrimaryOwner(
    queryRunner: QueryRunner,
    propertyId: number,
    schemaName?: string | null,
  ): Promise<void> {
    const schemaPrefix = this.schemaPrefix(schemaName);
    await queryRunner.query(
      `UPDATE ${schemaPrefix}property_owners
       SET is_primary = true
       WHERE id = (
         SELECT id
         FROM ${schemaPrefix}property_owners
         WHERE property_id = $1
         ORDER BY id ASC
         LIMIT 1
       )`,
      [propertyId],
    );
  }

  private async getTenantSchemaName(tenantSlug: string): Promise<string> {
    const tenants = await this.dataSource.query<{ schema_name: string }[]>(
      'SELECT schema_name FROM public.tenant WHERE slug = $1',
      [tenantSlug],
    );

    if (tenants.length === 0) {
      throw new NotFoundException(`Tenant with slug '${tenantSlug}' not found`);
    }

    return tenants[0].schema_name;
  }

  private schemaPrefix(schemaName?: string | null): string {
    return schemaName ? `${quoteIdent(schemaName)}.` : '';
  }
}
