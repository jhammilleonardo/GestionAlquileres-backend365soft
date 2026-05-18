import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

interface TenantHealthRow {
  id: number;
  slug: string;
  schema_name: string;
  schema_exists: boolean;
  has_tenant_config: boolean;
}

@Injectable()
export class TenantMaintenanceService {
  private readonly logger = new Logger(TenantMaintenanceService.name);

  constructor(private readonly dataSource: DataSource) {}

  /**
   * Desactiva tenants marcados como activos cuyo schema o tabla tenant_config
   * no existe. Esto evita que jobs globales intenten operar sobre tenants
   * huérfanos o incompletos.
   */
  async deactivateOrphanedActiveTenants(): Promise<void> {
    const rows = await this.dataSource.query<TenantHealthRow[]>(
      `SELECT
         t.id,
         t.slug,
         t.schema_name,
         EXISTS (
           SELECT 1
           FROM information_schema.schemata s
           WHERE s.schema_name = t.schema_name
         ) AS schema_exists,
         EXISTS (
           SELECT 1
           FROM information_schema.tables tb
           WHERE tb.table_schema = t.schema_name
             AND tb.table_name = 'tenant_config'
         ) AS has_tenant_config
       FROM public.tenant t
       WHERE t.is_active = true`,
    );

    const invalidRows = rows.filter(
      (row) => !row.schema_exists || !row.has_tenant_config,
    );

    if (invalidRows.length === 0) {
      return;
    }

    await this.dataSource.query(
      `UPDATE public.tenant
       SET is_active = false,
           updated_at = NOW()
       WHERE id = ANY($1::int[])`,
      [invalidRows.map((row) => row.id)],
    );

    for (const row of invalidRows) {
      this.logger.warn(
        `[${row.schema_name}] tenant desactivado automáticamente: schema/configuración incompleta`,
      );
    }
  }
}
