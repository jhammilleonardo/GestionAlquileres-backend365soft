import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantEmployeesProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureEmployees(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    for (const value of ['EMPLEADO', 'TECNICO']) {
      await this.dataSource.query(`
        DO $$ BEGIN
          ALTER TYPE ${q}.user_role_enum ADD VALUE IF NOT EXISTS '${value}';
        EXCEPTION
          WHEN others THEN null;
        END $$;
      `);
    }

    await this.dataSource.query(
      `ALTER TABLE ${q}."user" ADD COLUMN IF NOT EXISTS last_connection TIMESTAMP`,
    );

    await this.ensureEmployeePermissions(schemaName);
  }

  async ensureEmployeePermissions(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.employee_permissions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        module character varying NOT NULL,
        can_view boolean NOT NULL DEFAULT false,
        can_create boolean NOT NULL DEFAULT false,
        can_edit boolean NOT NULL DEFAULT false,
        can_delete boolean NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_employee_permissions_user FOREIGN KEY (user_id)
          REFERENCES ${q}."user"(id) ON DELETE CASCADE,
        CONSTRAINT uq_employee_permissions_user_module UNIQUE (user_id, module)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_EMPLOYEE_PERMISSIONS_USER_ID
        ON ${q}.employee_permissions(user_id);
    `);
  }
}
