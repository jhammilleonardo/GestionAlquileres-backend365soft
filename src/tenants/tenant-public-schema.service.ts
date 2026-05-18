import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';

@Injectable()
export class TenantPublicSchemaService {
  private readonly logger = new Logger(TenantPublicSchemaService.name);

  constructor(private readonly dataSource: DataSource) {}

  async initialize(): Promise<void> {
    await this.ensureTenantTable();
    await this.ensureSupportTables();
    await this.enforceTenantDefaults();
  }

  async ensureSupportTables(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS public.admin_index (
        email       VARCHAR(255) NOT NULL,
        tenant_id   INTEGER NOT NULL REFERENCES public.tenant(id) ON DELETE CASCADE,
        schema_name VARCHAR(63) NOT NULL,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, tenant_id)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_admin_index_email
        ON public.admin_index(email);
      CREATE INDEX IF NOT EXISTS idx_admin_index_tenant_id
        ON public.admin_index(tenant_id);
    `);

    await this.ensureAuthSecurityTables();
  }

  private async ensureAuthSecurityTables(): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS public.auth_login_attempts (
        email         VARCHAR(255) NOT NULL,
        tenant_slug   VARCHAR(63) NOT NULL,
        login_context VARCHAR(30) NOT NULL,
        failed_count  INTEGER NOT NULL DEFAULT 0,
        first_failed_at TIMESTAMPTZ,
        last_failed_at  TIMESTAMPTZ,
        locked_until    TIMESTAMPTZ,
        updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        PRIMARY KEY (email, tenant_slug, login_context)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS public.auth_security_events (
        id            BIGSERIAL PRIMARY KEY,
        email         VARCHAR(255),
        tenant_slug   VARCHAR(63),
        login_context VARCHAR(30),
        event_type    VARCHAR(50) NOT NULL,
        reason        VARCHAR(100),
        metadata      JSONB,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_auth_login_attempts_locked_until
        ON public.auth_login_attempts(locked_until);
      CREATE INDEX IF NOT EXISTS idx_auth_security_events_created_at
        ON public.auth_security_events(created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_auth_security_events_email_context
        ON public.auth_security_events(email, tenant_slug, login_context);
    `);
  }

  private async ensureTenantTable(): Promise<void> {
    const result = await this.dataSource.query<{ exists: boolean }[]>(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
          AND table_name = 'tenant'
      ) AS exists;
    `);

    if (result[0]?.exists) {
      this.logger.log('Tabla public.tenant ya existe');
      return;
    }

    this.logger.warn('Tabla public.tenant no existe. Creándola...');

    await this.dataSource.query(`
      CREATE TABLE public.tenant (
        id SERIAL PRIMARY KEY,
        slug VARCHAR NOT NULL UNIQUE,
        schema_name VARCHAR NOT NULL UNIQUE,
        company_name VARCHAR NOT NULL,
        logo_url VARCHAR,
        currency VARCHAR DEFAULT 'BOB',
        locale VARCHAR DEFAULT 'es-BO',
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMP NOT NULL DEFAULT NOW()
      );

      CREATE INDEX IF NOT EXISTS IDX_TENANT_SLUG
        ON public.tenant(slug);
      CREATE INDEX IF NOT EXISTS IDX_TENANT_SCHEMA_NAME
        ON public.tenant(schema_name);
      CREATE INDEX IF NOT EXISTS IDX_TENANT_IS_ACTIVE
        ON public.tenant(is_active);
    `);

    this.logger.log('Tabla public.tenant creada exitosamente');
  }

  private async enforceTenantDefaults(): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE public.tenant
      ALTER COLUMN is_active SET DEFAULT false;
    `);
  }
}
