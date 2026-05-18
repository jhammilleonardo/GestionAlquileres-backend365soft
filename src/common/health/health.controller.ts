import { Controller, Get } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

interface DatabaseVersionRow {
  version: string;
}

interface DataSourceConnectionInfo {
  database?: unknown;
  host?: unknown;
  port?: unknown;
}

interface DatabaseInfo {
  connected: boolean;
  database?: string;
  host?: string;
  port?: number;
  version?: string;
  error?: string;
}

interface HealthResponse {
  status: string;
  timestamp: string;
  database: DatabaseInfo | null;
}

@Controller('health')
export class HealthController {
  constructor(
    @InjectDataSource()
    private dataSource: DataSource,
  ) {}

  @Get()
  async check(): Promise<HealthResponse> {
    const dbConnected = this.dataSource.isInitialized;

    let dbInfo: DatabaseInfo | null = null;
    if (dbConnected) {
      try {
        const result =
          await this.dataSource.query<DatabaseVersionRow[]>('SELECT version()');
        const options = this.dataSource.options as DataSourceConnectionInfo;
        dbInfo = {
          connected: true,
          database:
            typeof options.database === 'string' ? options.database : undefined,
          host: typeof options.host === 'string' ? options.host : undefined,
          port: typeof options.port === 'number' ? options.port : undefined,
          version: result[0].version,
        };
      } catch (error) {
        dbInfo = {
          connected: false,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
      }
    }

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      database: dbInfo,
    };
  }
}
