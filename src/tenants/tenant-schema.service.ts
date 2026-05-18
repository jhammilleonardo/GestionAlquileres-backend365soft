import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantSchemaService {
  constructor(private readonly dataSource: DataSource) {}

  async createSchemaIfMissing(schemaName: string): Promise<void> {
    await this.dataSource.query(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(schemaName)}`,
    );
  }

  async createUserInfrastructure(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.user_role_enum AS ENUM ('ADMIN', 'INQUILINO', 'EMPLEADO', 'TECNICO', 'PROPIETARIO');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}."user" (
        id SERIAL PRIMARY KEY,
        email character varying NOT NULL UNIQUE,
        password character varying NOT NULL,
        name character varying NOT NULL,
        phone character varying,
        role ${q}.user_role_enum NOT NULL DEFAULT 'INQUILINO',
        is_active boolean NOT NULL DEFAULT true,
        last_connection TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_USER_EMAIL ON ${q}."user"(email);
    `);
  }

  async grantApplicationPermissions(schemaName: string): Promise<void> {
    const dbUser = process.env.DB_USERNAME || 'gestion_user';
    const qSchema = quoteIdent(schemaName);
    const qDbUser = quoteIdent(dbUser);

    await this.dataSource.query(
      `GRANT USAGE ON SCHEMA ${qSchema} TO ${qDbUser}`,
    );

    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${qSchema} TO ${qDbUser}`,
    );

    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${qSchema} TO ${qDbUser}`,
    );

    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT ALL ON TABLES TO ${qDbUser}`,
    );

    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${qSchema} GRANT ALL ON SEQUENCES TO ${qDbUser}`,
    );
  }

  async ensureUserRole(schemaName: string, role: string): Promise<void> {
    const safeRole = role.replace(/'/g, "''");

    await this.dataSource.query(`
      ALTER TYPE ${quoteIdent(schemaName)}.user_role_enum
        ADD VALUE IF NOT EXISTS '${safeRole}';
    `);
  }

  async dropSchema(schemaName: string): Promise<void> {
    try {
      await this.dataSource.query(
        `DROP SCHEMA IF EXISTS ${quoteIdent(schemaName)} CASCADE`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to drop schema: ${message}`);
    }
  }
}
