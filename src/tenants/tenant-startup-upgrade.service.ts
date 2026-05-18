import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { TenantAdminIndexService } from './tenant-admin-index.service';
import { TenantPublicSchemaService } from './tenant-public-schema.service';

export type TenantStartupUpgradeStep = [name: string, run: () => Promise<void>];
export type TenantStartupUpgradeStepFactory = (
  schemaName: string,
) => TenantStartupUpgradeStep[];

@Injectable()
export class TenantStartupUpgradeService {
  private readonly logger = new Logger(TenantStartupUpgradeService.name);

  constructor(
    private readonly dataSource: DataSource,
    private readonly tenantPublicSchemaService: TenantPublicSchemaService,
    private readonly tenantAdminIndexService: TenantAdminIndexService,
  ) {}

  async run(stepFactory: TenantStartupUpgradeStepFactory): Promise<void> {
    this.logger.log('Running startup upgrades for all tenant schemas...');
    await this.tenantPublicSchemaService.initialize();

    const rows = await this.dataSource.query<Array<{ schema_name: string }>>(`
      SELECT DISTINCT table_schema AS schema_name
      FROM information_schema.tables
      WHERE table_name = 'properties'
        AND table_schema NOT IN ('public', 'information_schema', 'pg_catalog')
      ORDER BY table_schema;
    `);

    if (rows.length === 0) {
      this.logger.log('No tenant schemas found. Skipping startup upgrades.');
      return;
    }

    for (const { schema_name: schemaName } of rows) {
      await this.runForSchema(schemaName, stepFactory(schemaName));
      await this.tenantAdminIndexService.syncForSchema(schemaName);
    }

    this.logger.log('Startup upgrades completed.');
  }

  private async runForSchema(
    schemaName: string,
    steps: TenantStartupUpgradeStep[],
  ): Promise<void> {
    this.logger.log(`Upgrading schema: ${schemaName}`);
    let stepsFailed = 0;

    for (const [stepName, step] of steps) {
      try {
        await step();
      } catch (error: unknown) {
        stepsFailed++;
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(
          `[${schemaName}] Step ${stepName} failed (non-fatal): ${message}`,
        );
      }
    }

    if (stepsFailed === 0) {
      this.logger.log(`Schema ${schemaName} upgraded successfully.`);
      return;
    }

    this.logger.warn(
      `Schema ${schemaName} upgraded with ${stepsFailed} step(s) skipped.`,
    );
  }
}
