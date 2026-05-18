import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { TenantPublicSchemaService } from './tenant-public-schema.service';

@Injectable()
export class TenantAdminIndexService {
  private readonly logger = new Logger(TenantAdminIndexService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantPublicSchemaService: TenantPublicSchemaService,
  ) {}

  async upsertAdmin(
    email: string,
    tenantId: number,
    schemaName: string,
  ): Promise<void> {
    await this.tenantPublicSchemaService.initialize();
    await this.dataSource.query(
      `INSERT INTO public.admin_index (email, tenant_id, schema_name, updated_at)
       VALUES (LOWER($1), $2, $3, NOW())
       ON CONFLICT (email, tenant_id) DO UPDATE
         SET schema_name = EXCLUDED.schema_name,
             updated_at = NOW()`,
      [email, tenantId, schemaName],
    );
  }

  async syncForSchema(schemaName: string): Promise<void> {
    await this.tenantPublicSchemaService.initialize();

    const userTable = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.tables
         WHERE table_schema = $1
           AND table_name = 'user'
       ) AS exists`,
      [schemaName],
    );

    if (!userTable[0]?.exists) {
      this.logger.debug(
        `[${schemaName}] user table not found. Skipping admin index sync.`,
      );
      return;
    }

    await this.dataSource.query(
      `
        DELETE FROM public.admin_index
        WHERE schema_name = $1
          AND NOT EXISTS (
            SELECT 1
            FROM ${quoteIdent(schemaName)}."user" u
            WHERE LOWER(u.email) = public.admin_index.email
              AND u.role = 'ADMIN'
              AND u.is_active = true
          )
      `,
      [schemaName],
    );

    await this.dataSource.query(
      `
        INSERT INTO public.admin_index (email, tenant_id, schema_name, updated_at)
        SELECT LOWER(u.email), t.id, t.schema_name, NOW()
        FROM ${quoteIdent(schemaName)}."user" u
        JOIN public.tenant t ON t.schema_name = $1
        WHERE u.role = 'ADMIN'
          AND u.is_active = true
        ON CONFLICT (email, tenant_id) DO UPDATE
          SET schema_name = EXCLUDED.schema_name,
              updated_at = NOW()
      `,
      [schemaName],
    );
  }
}
