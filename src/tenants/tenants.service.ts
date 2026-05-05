import {
  Injectable,
  NotFoundException,
  BadRequestException,
  OnModuleInit,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from './metadata/tenant.entity';
import { CreateTenantDto, TenantCountry } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { quoteIdent, schemaNameFromSlug } from '../common/utils/sql-identifier';
import { isValidTenantSlug } from '../common/utils/tenant-slug';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

@Injectable()
export class TenantsService implements OnModuleInit {
  private readonly logger = new Logger(TenantsService.name);
  private readonly notificationEventTypes = Object.values(
    NotificationEventType,
  );

  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private dataSource: DataSource,
  ) {}

  async onModuleInit() {
    await this.runStartupMigrations();
    await this.deactivateOrphanedActiveTenants();
  }

  /**
   * Ejecuta migraciones automáticas al arrancar la aplicación.
   * Itera todos los schemas de tenants existentes y aplica cambios
   * de forma idempotente (IF NOT EXISTS / ADD COLUMN IF NOT EXISTS).
   */
  private async runStartupMigrations() {
    this.logger.log('Running startup migrations for all tenant schemas...');

    // Obtener todos los schemas de tenants (los que tienen tabla "properties")
    const rows: { schema_name: string }[] = await this.dataSource.query(`
      SELECT DISTINCT table_schema AS schema_name
      FROM information_schema.tables
      WHERE table_name = 'properties'
        AND table_schema NOT IN ('public', 'information_schema', 'pg_catalog')
      ORDER BY table_schema;
    `);

    if (rows.length === 0) {
      this.logger.log('No tenant schemas found. Skipping startup migrations.');
      return;
    }

    for (const { schema_name } of rows) {
      this.logger.log(`Migrating schema: ${schema_name}`);
      let stepsFailed = 0;

      const steps: Array<[string, () => Promise<void>]> = [
        [
          'migratePropertyColumns',
          () => this.migratePropertyColumns(schema_name),
        ],
        ['migrateImagesToJson', () => this.migrateImagesToJson(schema_name)],
        ['createPaymentsTables', () => this.createPaymentsTables(schema_name)],
        [
          'migrateContractsApplicationId',
          () => this.migrateContractsApplicationId(schema_name),
        ],
        [
          'migrateEmployeeTables',
          () => this.migrateEmployeeTables(schema_name),
        ],
        [
          'createTenantConfigTable',
          () => this.createTenantConfigTable(schema_name),
        ],
        [
          'createPropertyLeadsTable',
          () => this.createPropertyLeadsTable(schema_name),
        ],
        ['createUnitsTables', () => this.createUnitsTables(schema_name)],
        [
          'migrateContractsUnitId',
          () => this.migrateContractsUnitId(schema_name),
        ],
        [
          'migrateRentalOwnersBankFields',
          () => this.migrateRentalOwnersBankFields(schema_name),
        ],
        [
          'migrateApplicationsScreeningFields',
          () => this.migrateApplicationsScreeningFields(schema_name),
        ],
        [
          'createScreeningChecklistTable',
          () => this.createScreeningChecklistTable(schema_name),
        ],
        [
          'migrateMaintenanceStageFields',
          () => this.migrateMaintenanceStageFields(schema_name),
        ],
        [
          'createMaintenanceStageHistoryTable',
          () => this.createMaintenanceStageHistoryTable(schema_name),
        ],
        [
          'migrateOwnerStatementsFields',
          () => this.migrateOwnerStatementsFields(schema_name),
        ],
        [
          'createInspectionsTables',
          () => this.createInspectionsTables(schema_name),
        ],
        ['migrateExpensesTable', () => this.migrateExpensesTable(schema_name)],
        [
          'migrateUserRolePropietario',
          () => this.migrateUserRolePropietario(schema_name),
        ],
        [
          'createViolationsTable',
          () => this.createViolationsTable(schema_name),
        ],
        ['createVendorsTable', () => this.createVendorsTable(schema_name)],
        [
          'migrateMaintenanceVendorFields',
          () => this.migrateMaintenanceVendorFields(schema_name),
        ],
        [
          'migrateUnitsShortTermFields',
          () => this.migrateUnitsShortTermFields(schema_name),
        ],
        [
          'createPropertyAvailabilityTable',
          () => this.createPropertyAvailabilityTable(schema_name),
        ],
        [
          'createReservationsTable',
          () => this.createReservationsTable(schema_name),
        ],
        [
          'createLifecycleNotificationLog',
          () => this.createLifecycleNotificationLog(schema_name),
        ],
        [
          'migrateNotificationEventTypeEnum',
          () => this.migrateNotificationEventTypeEnum(schema_name),
        ],
        [
          'createContractTemplatesTable',
          () => this.createContractTemplatesTable(schema_name),
        ],
        ['createAuditLogsTable', () => this.createAuditLogsTable(schema_name)],
        [
          'createTenantWebsiteTable',
          () => this.createTenantWebsiteTable(schema_name),
        ],
        [
          'createWebsiteContactsTable',
          () => this.createWebsiteContactsTable(schema_name),
        ],
        [
          'migratePropertyCatalog',
          () => this.migratePropertyCatalog(schema_name),
        ],
      ];

      for (const [stepName, step] of steps) {
        try {
          await step();
        } catch (error: unknown) {
          stepsFailed++;
          const message =
            error instanceof Error ? error.message : String(error);
          this.logger.warn(
            `[${schema_name}] Step ${stepName} failed (non-fatal): ${message}`,
          );
        }
      }

      if (stepsFailed === 0) {
        this.logger.log(`Schema ${schema_name} migrated successfully.`);
      } else {
        this.logger.warn(
          `Schema ${schema_name} migrated with ${stepsFailed} step(s) skipped.`,
        );
      }
    }

    this.logger.log('Startup migrations completed.');
  }

  /**
   * Desactiva tenants marcados como activos cuyo schema o tabla tenant_config
   * no existe. Esto evita que jobs globales (cron, auth cross-tenant, etc.)
   * intenten operar sobre tenants huérfanos/incompletos.
   */
  private async deactivateOrphanedActiveTenants(): Promise<void> {
    const rows = await this.dataSource.query<
      Array<{
        id: number;
        slug: string;
        schema_name: string;
        schema_exists: boolean;
        has_tenant_config: boolean;
      }>
    >(
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

    const invalidIds = rows
      .filter((row) => !row.schema_exists || !row.has_tenant_config)
      .map((row) => row.id);

    if (invalidIds.length === 0) {
      return;
    }

    await this.dataSource.query(
      `UPDATE public.tenant
       SET is_active = false,
           updated_at = NOW()
       WHERE id = ANY($1::int[])`,
      [invalidIds],
    );

    for (const row of rows.filter((row) => invalidIds.includes(row.id))) {
      this.logger.warn(
        `[${row.schema_name}] tenant desactivado automáticamente: schema/configuración incompleta`,
      );
    }
  }

  /** Agrega las columnas faltantes a la tabla properties de un schema. */
  private async migratePropertyColumns(schemaName: string) {
    const columns: [string, string][] = [
      ['monthly_rent', 'NUMERIC(10,2) NULL'],
      ['currency', "VARCHAR(10) NOT NULL DEFAULT 'BOB'"],
      ['square_meters', 'NUMERIC(10,2) NULL'],
      ['bedrooms', 'INT NULL'],
      ['bathrooms', 'INT NULL'],
      ['parking_spaces', 'INT NULL'],
      ['year_built', 'INT NULL'],
      ['is_furnished', 'BOOLEAN NOT NULL DEFAULT FALSE'],
      ['property_rules', 'JSONB NULL'],
      ['rental_type', 'VARCHAR(20) NULL'],
      ['view_count', 'INT NOT NULL DEFAULT 0'],
      ['last_viewed_at', 'TIMESTAMP NULL'],
    ];

    for (const [col, def] of columns) {
      await this.dataSource.query(
        `ALTER TABLE ${quoteIdent(schemaName)}.properties ADD COLUMN IF NOT EXISTS ${col} ${def}`,
      );
    }
  }

  /**
   * Migra la columna images de text[] a json si todavía es del tipo antiguo.
   * Es idempotente: no hace nada si ya es json.
   */
  private async migrateImagesToJson(schemaName: string) {
    const result: { udt_name: string }[] = await this.dataSource.query(
      `
        SELECT udt_name
        FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'properties'
          AND column_name = 'images'
      `,
      [schemaName],
    );

    if (result.length === 0 || result[0].udt_name !== '_text') {
      return; // Ya es json o la columna no existe
    }

    this.logger.log(
      `Migrating images column (text[] → json) in ${quoteIdent(schemaName)}`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.properties ADD COLUMN IF NOT EXISTS images_json json DEFAULT '[]'`,
    );
    await this.dataSource.query(
      `UPDATE ${quoteIdent(schemaName)}.properties SET images_json = to_json(images) WHERE images IS NOT NULL`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.properties DROP COLUMN images`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.properties RENAME COLUMN images_json TO images`,
    );
  }

  /** Agrega la columna application_id a la tabla contracts si no existe. */
  private async migrateContractsApplicationId(schemaName: string) {
    const [tableExists] = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'rental_applications'
      )`,
      [schemaName],
    );
    if (!tableExists?.exists) return;

    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.contracts ADD COLUMN IF NOT EXISTS application_id INTEGER REFERENCES ${quoteIdent(schemaName)}.rental_applications(id) ON DELETE SET NULL`,
    );
  }

  /**
   * Migra los schemas de tenants existentes para soportar empleados:
   * - Agrega 'EMPLEADO' al enum user_role_enum
   * - Agrega columna last_connection a la tabla user
   * - Crea la tabla employee_permissions si no existe
   */
  private async migrateEmployeeTables(schemaName: string) {
    // Agregar valores al enum si no existen
    for (const value of ['EMPLEADO', 'TECNICO']) {
      await this.dataSource.query(`
        DO $$ BEGIN
          ALTER TYPE ${quoteIdent(schemaName)}.user_role_enum ADD VALUE IF NOT EXISTS '${value}';
        EXCEPTION
          WHEN others THEN null;
        END $$;
      `);
    }

    // Agregar columna last_connection si no existe
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}."user" ADD COLUMN IF NOT EXISTS last_connection TIMESTAMP`,
    );

    // Crear la tabla employee_permissions
    await this.createEmployeePermissionsTable(schemaName);
  }

  private async createEmployeePermissionsTable(schemaName: string) {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.employee_permissions (
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
          REFERENCES ${quoteIdent(schemaName)}."user"(id) ON DELETE CASCADE,
        CONSTRAINT uq_employee_permissions_user_module UNIQUE (user_id, module)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_EMPLOYEE_PERMISSIONS_USER_ID
        ON ${quoteIdent(schemaName)}.employee_permissions(user_id);
    `);
  }

  private readonly configDefaultsByCountry: Record<
    TenantCountry,
    {
      currency: string;
      language: string;
      timezone: string;
      date_format: string;
      rental_type: string;
      payment_methods: string[];
      notification_channels: {
        email: boolean;
        whatsapp: boolean;
        internal: boolean;
      };
      commission_percentage: number;
      grace_days_late_fee: number;
      late_fee_percentage: number;
    }
  > = {
    [TenantCountry.US]: {
      currency: 'USD',
      language: 'en',
      timezone: 'America/New_York',
      date_format: 'MM/DD/YYYY',
      rental_type: 'LONG_TERM',
      payment_methods: ['stripe', 'ach', 'paypal'],
      notification_channels: { email: true, whatsapp: false, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 5,
    },
    [TenantCountry.BO]: {
      currency: 'BOB',
      language: 'es',
      timezone: 'America/La_Paz',
      date_format: 'DD/MM/YYYY',
      rental_type: 'BOTH',
      payment_methods: ['qr_accl', 'transferencia'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 10,
      grace_days_late_fee: 5,
      late_fee_percentage: 2,
    },
    [TenantCountry.GT]: {
      currency: 'GTQ',
      language: 'es',
      timezone: 'America/Guatemala',
      date_format: 'DD/MM/YYYY',
      rental_type: 'BOTH',
      payment_methods: ['stripe', 'payu', 'tarjeta'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 3,
    },
    [TenantCountry.HN]: {
      currency: 'HNL',
      language: 'es',
      timezone: 'America/Tegucigalpa',
      date_format: 'DD/MM/YYYY',
      rental_type: 'LONG_TERM',
      payment_methods: ['payu', 'tarjeta', 'transferencia'],
      notification_channels: { email: true, whatsapp: true, internal: true },
      commission_percentage: 0,
      grace_days_late_fee: 5,
      late_fee_percentage: 3,
    },
  };

  private async createPropertyLeadsTable(schemaName: string) {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_leads (
        id SERIAL PRIMARY KEY,
        property_id INT NOT NULL REFERENCES ${quoteIdent(schemaName)}.properties(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        inquiry_type VARCHAR(50) DEFAULT 'general',
        availability VARCHAR(50),
        status VARCHAR(50) DEFAULT 'PENDING',
        user_ip VARCHAR(45),
        assigned_to INT REFERENCES ${quoteIdent(schemaName)}."user"(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_property_leads_property_id ON ${quoteIdent(schemaName)}.property_leads(property_id);
      CREATE INDEX IF NOT EXISTS idx_property_leads_email ON ${quoteIdent(schemaName)}.property_leads(email);
      CREATE INDEX IF NOT EXISTS idx_property_leads_status ON ${quoteIdent(schemaName)}.property_leads(status);
      CREATE INDEX IF NOT EXISTS idx_property_leads_created_at ON ${quoteIdent(schemaName)}.property_leads(created_at DESC);
    `);
  }

  private async createUnitsTables(schemaName: string): Promise<void> {
    // ENUM de unit_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.unit_status_enum AS ENUM (
          'available', 'occupied', 'maintenance', 'reserved'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de rental_type (si no existe ya)
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.unit_rental_type_enum AS ENUM (
          'SHORT_TERM', 'LONG_TERM', 'BOTH'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.units (
        id             SERIAL PRIMARY KEY,
        property_id    INTEGER NOT NULL,
        unit_number    VARCHAR(50) NOT NULL,
        floor          INTEGER,
        bedrooms       INTEGER,
        bathrooms      INTEGER,
        square_meters  NUMERIC(10,2),
        status         ${quoteIdent(schemaName)}.unit_status_enum NOT NULL DEFAULT 'available',
        rental_type    ${quoteIdent(schemaName)}.unit_rental_type_enum,
        price_per_month  NUMERIC(10,2),
        price_per_night  NUMERIC(10,2),
        deposit_amount   NUMERIC(10,2),
        features         JSONB,
        created_at     TIMESTAMP NOT NULL DEFAULT now(),
        updated_at     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_units_property
          FOREIGN KEY (property_id) REFERENCES ${quoteIdent(schemaName)}.properties(id) ON DELETE CASCADE,
        CONSTRAINT uq_units_property_number
          UNIQUE (property_id, unit_number)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_units_property_id
        ON ${quoteIdent(schemaName)}.units(property_id);
      CREATE INDEX IF NOT EXISTS idx_units_status
        ON ${quoteIdent(schemaName)}.units(status);
    `);
  }

  /**
   * Agrega los campos bancarios a rental_owners para schemas existentes.
   * Idempotente: usa ADD COLUMN IF NOT EXISTS.
   */
  private async migrateRentalOwnersBankFields(
    schemaName: string,
  ): Promise<void> {
    const columns: [string, string][] = [
      ['bank_name', 'VARCHAR(100) NULL'],
      ['account_number', 'VARCHAR(50)  NULL'],
      ['account_type', 'VARCHAR(20)  NULL'],
      ['account_holder_name', 'VARCHAR(150) NULL'],
      ['cbu_iban', 'VARCHAR(50)  NULL'],
    ];

    for (const [col, def] of columns) {
      await this.dataSource.query(
        `ALTER TABLE ${quoteIdent(schemaName)}.rental_owners ADD COLUMN IF NOT EXISTS ${col} ${def}`,
      );
    }
  }

  /**
   * Agrega los campos nuevos a owner_statements para schemas existentes:
   *   - unit_id        (nullable FK a units)
   *   - status         ('pending' | 'transferred', default 'pending')
   *   - transferred_at (timestamp nullable)
   */
  private async migrateOwnerStatementsFields(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.owner_statements (
        id                    SERIAL PRIMARY KEY,
        rental_owner_id       INTEGER NOT NULL,
        property_id           INTEGER NOT NULL,
        unit_id               INTEGER REFERENCES ${schemaName}.units(id) ON DELETE SET NULL,
        period_month          INTEGER NOT NULL,
        period_year           INTEGER NOT NULL,
        gross_rent            NUMERIC(12,2) NOT NULL,
        maintenance_deduction NUMERIC(12,2) NOT NULL DEFAULT 0,
        management_commission NUMERIC(12,2) NOT NULL,
        net_amount            NUMERIC(12,2) NOT NULL,
        currency              VARCHAR(3) NOT NULL DEFAULT 'BOB',
        payment_count         INTEGER NOT NULL DEFAULT 0,
        status                VARCHAR(20) NOT NULL DEFAULT 'pending',
        transferred_at        TIMESTAMP,
        generated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE (rental_owner_id, property_id, period_year, period_month)
      )
    `);

    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.owner_statements
         ADD COLUMN IF NOT EXISTS unit_id INTEGER
           REFERENCES ${quoteIdent(schemaName)}.units(id) ON DELETE SET NULL`,
    );

    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.owner_statements
         ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`,
    );

    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.owner_statements
         ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP`,
    );

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_statements_status
        ON ${quoteIdent(schemaName)}.owner_statements(status);
    `);
  }

  /** Agrega screening_fee_paid a rental_applications para schemas existentes. */
  private async migrateApplicationsScreeningFields(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.rental_applications ADD COLUMN IF NOT EXISTS screening_fee_paid BOOLEAN NOT NULL DEFAULT FALSE`,
    );
  }

  /** Crea la tabla screening_checklist si no existe. */
  private async createScreeningChecklistTable(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.screening_final_status_enum AS ENUM (
          'APPROVED', 'REJECTED', 'REQUIRES_COSIGNER'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.screening_checklist (
        id                       SERIAL PRIMARY KEY,
        application_id           INTEGER NOT NULL UNIQUE
          REFERENCES ${quoteIdent(schemaName)}.rental_applications(id) ON DELETE CASCADE,
        documents_verified       BOOLEAN NOT NULL DEFAULT FALSE,
        employer_call_name       VARCHAR(150),
        employer_call_phone      VARCHAR(30),
        employer_call_result     VARCHAR(50),
        previous_landlord_name   VARCHAR(150),
        previous_landlord_phone  VARCHAR(30),
        previous_landlord_result VARCHAR(50),
        blacklist_checked        BOOLEAN NOT NULL DEFAULT FALSE,
        blacklist_result         VARCHAR(50),
        notes                    TEXT,
        final_status             ${quoteIdent(schemaName)}.screening_final_status_enum,
        reviewed_by              INTEGER REFERENCES ${quoteIdent(schemaName)}."user"(id) ON DELETE SET NULL,
        reviewed_at              TIMESTAMP,
        created_at               TIMESTAMP NOT NULL DEFAULT NOW(),
        updated_at               TIMESTAMP NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_screening_checklist_application_id
        ON ${quoteIdent(schemaName)}.screening_checklist(application_id);
    `);
  }

  /** Agrega unit_id nullable FK a contracts para schemas existentes. */
  private async migrateContractsUnitId(schemaName: string): Promise<void> {
    await this.dataSource.query(`
      ALTER TABLE ${quoteIdent(schemaName)}.contracts
        ADD COLUMN IF NOT EXISTS unit_id INTEGER
          REFERENCES ${quoteIdent(schemaName)}.units(id) ON DELETE SET NULL;
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_contracts_unit_id
        ON ${quoteIdent(schemaName)}.contracts(unit_id);
    `);
  }

  /**
   * Agrega el rol PROPIETARIO al ENUM user_role_enum de schemas ya existentes.
   * Idempotente — ADD VALUE IF NOT EXISTS no falla si el valor ya existe.
   * NOTA: ALTER TYPE ... ADD VALUE no puede ejecutarse dentro de una transacción activa.
   */
  private async migrateUserRolePropietario(schemaName: string): Promise<void> {
    // Ejecutar con autocommit implícito (sin transacción)
    await this.dataSource.query(`
      ALTER TYPE ${quoteIdent(schemaName)}.user_role_enum
        ADD VALUE IF NOT EXISTS 'PROPIETARIO';
    `);
  }

  /**
   * Sincroniza notification_event_type_enum con NotificationEventType.
   * Previene drift entre código y enum SQL para nuevos y antiguos tenants.
   */
  private async migrateNotificationEventTypeEnum(
    schemaName: string,
  ): Promise<void> {
    const [typeExists] = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
         SELECT 1
         FROM pg_type t
         JOIN pg_namespace n ON n.oid = t.typnamespace
         WHERE t.typname = 'notification_event_type_enum'
           AND n.nspname = $1
       )`,
      [schemaName],
    );

    if (!typeExists?.exists) {
      await this.createNotificationsTables(schemaName);
      return;
    }

    for (const eventType of this.notificationEventTypes) {
      const safeEventType = eventType.replace(/'/g, "''");
      await this.dataSource.query(`
        ALTER TYPE ${quoteIdent(schemaName)}.notification_event_type_enum
          ADD VALUE IF NOT EXISTS '${safeEventType}';
      `);
    }

    await this.createNotificationsTables(schemaName);
  }

  private async createTenantConfigTable(
    schemaName: string,
    country: TenantCountry = TenantCountry.BO,
  ) {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.tenant_config (
        id SERIAL PRIMARY KEY,
        country VARCHAR(2) NOT NULL,
        currency VARCHAR(3) NOT NULL,
        language VARCHAR(2) NOT NULL,
        timezone VARCHAR(100) NOT NULL,
        date_format VARCHAR(20) NOT NULL,
        rental_type VARCHAR(20) NOT NULL,
        payment_methods JSONB NOT NULL DEFAULT '[]',
        notification_channels JSONB NOT NULL DEFAULT '{"email": true, "whatsapp": false, "internal": true}',
        commission_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
        grace_days_late_fee INTEGER NOT NULL DEFAULT 0,
        late_fee_percentage NUMERIC(5,2) NOT NULL DEFAULT 0,
        custom_expense_categories JSONB NOT NULL DEFAULT '[]',
        setup_completed BOOLEAN NOT NULL DEFAULT false,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    const defaults = this.configDefaultsByCountry[country];

    // Insertar fila inicial solo si la tabla está vacía
    await this.dataSource.query(
      `
      INSERT INTO ${quoteIdent(schemaName)}.tenant_config (
        country, currency, language, timezone, date_format,
        rental_type, payment_methods, notification_channels,
        commission_percentage, grace_days_late_fee, late_fee_percentage, setup_completed
      )
      SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false
      WHERE NOT EXISTS (SELECT 1 FROM ${quoteIdent(schemaName)}.tenant_config);
      `,
      [
        country,
        defaults.currency,
        defaults.language,
        defaults.timezone,
        defaults.date_format,
        defaults.rental_type,
        JSON.stringify(defaults.payment_methods),
        JSON.stringify(defaults.notification_channels),
        defaults.commission_percentage,
        defaults.grace_days_late_fee,
        defaults.late_fee_percentage,
      ],
    );
  }

  async create(createTenantDto: CreateTenantDto) {
    // Defensa en profundidad: aunque el DTO valida el slug con class-validator,
    // rechazar aquí cualquier valor que no cumpla el formato o sea reservado.
    if (!isValidTenantSlug(createTenantDto.slug)) {
      throw new BadRequestException(
        `Invalid or reserved tenant slug: '${createTenantDto.slug}'`,
      );
    }

    // Verificar si ya existe el slug
    const existingSlug = await this.tenantRepository.findOne({
      where: { slug: createTenantDto.slug },
    });

    if (existingSlug) {
      throw new BadRequestException(
        `Tenant with slug '${createTenantDto.slug}' already exists`,
      );
    }

    // Generar schema_name a partir del slug (usa el derivador canónico)
    const schema_name = schemaNameFromSlug(createTenantDto.slug);

    // Verificar si ya existe el schema_name
    const existingSchema = await this.tenantRepository.findOne({
      where: { schema_name },
    });

    if (existingSchema) {
      throw new BadRequestException(`Schema '${schema_name}' already exists`);
    }

    const tenant = this.tenantRepository.create({
      ...createTenantDto,
      schema_name,
      // Se crea inactivo hasta finalizar provisioning completo.
      is_active: false,
    });

    const savedTenant = await this.tenantRepository.save(tenant);

    // Crear el schema en PostgreSQL; si falla, limpiar el registro del tenant.
    // Al finalizar correctamente, activar según lo solicitado (default true).
    try {
      await this.createTenantSchema(savedTenant, createTenantDto.country);
      await this.tenantRepository.update(savedTenant.id, {
        is_active: createTenantDto.is_active ?? true,
      });
    } catch (error) {
      try {
        await this.tenantRepository.update(savedTenant.id, { is_active: false });
      } finally {
        await this.tenantRepository.delete(savedTenant.id).catch(() => undefined);
      }
      throw error;
    }

    return this.findOne(savedTenant.id);
  }

  async findAll() {
    return this.tenantRepository.find();
  }

  async findOne(id: number) {
    const tenant = await this.tenantRepository.findOne({ where: { id } });

    if (!tenant) {
      throw new NotFoundException(`Tenant with ID ${id} not found`);
    }

    return tenant;
  }

  async findBySlug(slug: string) {
    const tenant = await this.tenantRepository.findOne({ where: { slug } });

    if (!tenant) {
      throw new NotFoundException(`Tenant with slug '${slug}' not found`);
    }

    return tenant;
  }

  async findActiveBySlug(slug: string) {
    const tenant = await this.tenantRepository.findOne({
      where: { slug, is_active: true },
    });

    if (!tenant) {
      throw new NotFoundException(
        `Active tenant with slug '${slug}' not found`,
      );
    }

    return tenant;
  }

  async update(id: number, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // Verify exists

    // Si se cambia el slug, actualizar también el schema_name
    const updateData: Partial<Tenant> = { ...updateTenantDto };

    if (updateTenantDto.slug) {
      if (!isValidTenantSlug(updateTenantDto.slug)) {
        throw new BadRequestException(
          `Invalid or reserved tenant slug: '${updateTenantDto.slug}'`,
        );
      }
      updateData.schema_name = schemaNameFromSlug(updateTenantDto.slug);
    }

    await this.tenantRepository.update(id, updateData);
    return this.findOne(id);
  }

  async remove(id: number) {
    const tenant = await this.findOne(id);

    // Opcional: Eliminar el schema de PostgreSQL
    await this.dropTenantSchema(tenant);

    await this.tenantRepository.delete(id);

    return { message: 'Tenant deleted successfully' };
  }

  private async createTenantSchema(
    tenant: Tenant,
    country: TenantCountry = TenantCountry.BO,
  ) {
    try {
      // 1. Crear el schema en PostgreSQL
      await this.dataSource.query(
        `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(tenant.schema_name)}`,
      );

      // 2. Crear ENUMs necesarios
      // ENUM de user_role
      await this.dataSource.query(`
        DO $$ BEGIN
          CREATE TYPE ${quoteIdent(tenant.schema_name)}.user_role_enum AS ENUM ('ADMIN', 'INQUILINO', 'EMPLEADO', 'TECNICO', 'PROPIETARIO');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 3. Crear la tabla user
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS ${quoteIdent(tenant.schema_name)}."user" (
          id SERIAL PRIMARY KEY,
          email character varying NOT NULL UNIQUE,
          password character varying NOT NULL,
          name character varying NOT NULL,
          phone character varying,
          role ${quoteIdent(tenant.schema_name)}.user_role_enum NOT NULL DEFAULT 'INQUILINO',
          is_active boolean NOT NULL DEFAULT true,
          last_connection TIMESTAMP,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        );
      `);

      // 4. Crear índices en user
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS IDX_USER_EMAIL ON ${quoteIdent(tenant.schema_name)}."user"(email);
      `);

      // 5. Crear tablas de Properties
      await this.createPropertiesTables(tenant.schema_name);

      // 6. Crear tablas de Applications (antes de Contracts, ya que contracts referencia rental_applications)
      await this.createApplicationsTables(tenant.schema_name);

      // 7. Crear tablas de Contracts
      await this.createContractsTables(tenant.schema_name);

      // 8. Crear tablas de Maintenance
      await this.createMaintenanceTables(tenant.schema_name);

      // 9. Crear tablas de proveedores y columnas extendidas de mantenimiento
      await this.createVendorsTable(tenant.schema_name);
      await this.migrateMaintenanceVendorFields(tenant.schema_name);

      // 10. Crear tablas de Notifications
      await this.createNotificationsTables(tenant.schema_name);

      // 11. Crear tablas de Payments
      await this.createPaymentsTables(tenant.schema_name);

      // 12. Crear tabla de permisos de empleados
      await this.createEmployeePermissionsTable(tenant.schema_name);

      // 13. Crear tabla de configuración del tenant
      await this.createTenantConfigTable(tenant.schema_name, country);

      // 14. Crear tabla de leads del catálogo público
      await this.createPropertyLeadsTable(tenant.schema_name);

      // 15. Crear tabla de unidades
      await this.createUnitsTables(tenant.schema_name);

      // 16. Crear tabla de liquidaciones de propietarios (usada por split payment)
      await this.migrateOwnerStatementsFields(tenant.schema_name);

      // 17. Campos bancarios en rental_owners ya incluidos en createPropertiesTables
      // (la tabla se crea con esos campos desde el inicio)

      // 18. Crear tablas de Inspecciones
      await this.createInspectionsTables(tenant.schema_name);

      // 19. Crear tablas de Gastos (Expenses)
      await this.createExpensesTables(tenant.schema_name);

      // 20. Crear tabla de audit logs
      await this.createAuditLogsTable(tenant.schema_name);

      // 21. Crear tablas del sitio web público del tenant
      await this.createTenantWebsiteTable(tenant.schema_name);
      await this.createWebsiteContactsTable(tenant.schema_name);

      // 22. Insertar datos iniciales (seed data)
      await this.seedPropertyTypesAndSubtypes(tenant.schema_name);

      // 23. Otorgar permisos al usuario de la aplicación
      await this.grantSchemaPermissions(tenant.schema_name);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to create schema: ${message}`);
    }
  }

  private async grantSchemaPermissions(schemaName: string) {
    const dbUser = process.env.DB_USERNAME || 'gestion_user';

    // Otorgar permisos de uso del schema
    await this.dataSource.query(
      `GRANT USAGE ON SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(dbUser)}`,
    );

    // Otorgar todos los privilegios sobre todas las tablas existentes
    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(dbUser)}`,
    );

    // Otorgar todos los privilegios sobre todas las secuencias existentes
    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${quoteIdent(schemaName)} TO ${quoteIdent(dbUser)}`,
    );

    // NOTA: Los permisos USAGE sobre el schema son suficientes para usar los tipos (ENUMs)
    // No es necesario otorgar permisos adicionales sobre tipos específicos

    // Configurar permisos por defecto para futuras tablas
    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schemaName)} GRANT ALL ON TABLES TO ${quoteIdent(dbUser)}`,
    );

    // Configurar permisos por defecto para futuras secuencias
    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${quoteIdent(schemaName)} GRANT ALL ON SEQUENCES TO ${quoteIdent(dbUser)}`,
    );
  }

  private async createPropertiesTables(schemaName: string) {
    // Tabla: property_types
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_types (
        id SERIAL PRIMARY KEY,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Tabla: property_subtypes
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_subtypes (
        id SERIAL PRIMARY KEY,
        property_type_id integer NOT NULL,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_subtypes_type FOREIGN KEY (property_type_id)
          REFERENCES ${quoteIdent(schemaName)}.property_types(id)
      );
    `);

    // Tabla: rental_owners
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.rental_owners (
        id SERIAL PRIMARY KEY,
        name character varying NOT NULL,
        company_name character varying,
        is_company boolean,
        primary_email character varying NOT NULL,
        phone_number character varying NOT NULL,
        secondary_email character varying,
        secondary_phone character varying,
        notes text DEFAULT '',
        is_active boolean NOT NULL DEFAULT true,
        bank_name VARCHAR(100),
        account_number VARCHAR(50),
        account_type VARCHAR(20),
        account_holder_name VARCHAR(150),
        cbu_iban VARCHAR(50),
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Tabla: properties
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.properties (
        id SERIAL PRIMARY KEY,
        title character varying NOT NULL,
        description character varying,
        property_type_id integer NOT NULL,
        property_subtype_id integer NOT NULL,
        status character varying NOT NULL DEFAULT 'DISPONIBLE',
        latitude decimal(10,8),
        longitude decimal(11,8),
        images json DEFAULT '[]',
        security_deposit_amount decimal(10,2),
        amenities json DEFAULT '[]',
        included_items json DEFAULT '[]',
        account_number character varying,
        account_type character varying,
        account_holder_name character varying,
        monthly_rent NUMERIC(10,2) NULL,
        currency VARCHAR(10) NOT NULL DEFAULT 'BOB',
        square_meters NUMERIC(10,2) NULL,
        bedrooms INT NULL,
        bathrooms INT NULL,
        parking_spaces INT NULL,
        year_built INT NULL,
        is_furnished BOOLEAN NOT NULL DEFAULT FALSE,
        property_rules JSONB NULL,
        rental_type VARCHAR(20) NULL,
        view_count INT NOT NULL DEFAULT 0,
        last_viewed_at TIMESTAMP NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_properties_type FOREIGN KEY (property_type_id)
          REFERENCES ${quoteIdent(schemaName)}.property_types(id),
        CONSTRAINT fk_properties_subtype FOREIGN KEY (property_subtype_id)
          REFERENCES ${quoteIdent(schemaName)}.property_subtypes(id),
        CONSTRAINT chk_properties_status
          CHECK (status IN ('DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'))
      );
    `);

    // Tabla: property_addresses
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_addresses (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        address_type character varying NOT NULL,
        street_address character varying NOT NULL,
        city character varying,
        state character varying,
        zip_code character varying,
        country character varying NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_addresses_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id) ON DELETE CASCADE,
        CONSTRAINT chk_property_addresses_type
          CHECK (address_type IN ('address_1', 'address_2', 'address_3'))
      );
    `);

    // Tabla: property_owners
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_owners (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        rental_owner_id integer NOT NULL,
        ownership_percentage integer NOT NULL DEFAULT 0,
        is_primary boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_owners_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_property_owners_owner FOREIGN KEY (rental_owner_id)
          REFERENCES ${quoteIdent(schemaName)}.rental_owners(id),
        CONSTRAINT chk_ownership_percentage
          CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100)
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_TYPE ON ${quoteIdent(schemaName)}.properties(property_type_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_SUBTYPE ON ${quoteIdent(schemaName)}.properties(property_subtype_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_STATUS ON ${quoteIdent(schemaName)}.properties(status);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_ADDRESSES_PROPERTY ON ${quoteIdent(schemaName)}.property_addresses(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_PROPERTY ON ${quoteIdent(schemaName)}.property_owners(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_OWNER ON ${quoteIdent(schemaName)}.property_owners(rental_owner_id);
    `);
  }

  private async createContractsTables(schemaName: string) {
    // ENUM de contract_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.contract_status_enum AS ENUM (
          'BORRADOR', 'PENDIENTE', 'FIRMADO', 'ACTIVO', 
          'POR_VENCER', 'VENCIDO', 'RENOVADO', 'FINALIZADO', 
          'CANCELADO', 'SUSPENDIDO'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: contracts
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.contracts (
        id SERIAL PRIMARY KEY,
        contract_number character varying NOT NULL UNIQUE,
        tenant_id integer NOT NULL,
        property_id integer NOT NULL,
        status ${quoteIdent(schemaName)}.contract_status_enum NOT NULL DEFAULT 'BORRADOR',
        start_date date NOT NULL,
        end_date date NOT NULL,
        duration_months integer,
        key_delivery_date date,
        tenant_signature_date timestamp with time zone,
        owner_signature_date timestamp with time zone,
        signed_ip character varying,
        activation_date timestamp with time zone,
        actual_termination_date date,
        monthly_rent decimal(10,2) NOT NULL,
        currency character varying DEFAULT 'BOB',
        payment_day integer DEFAULT 5,
        deposit_amount decimal(10,2) DEFAULT 0,
        payment_method character varying,
        late_fee_percentage decimal(10,2) DEFAULT 0,
        grace_days integer DEFAULT 0,
        included_services jsonb DEFAULT '[]',
        tenant_responsibilities text,
        owner_responsibilities text,
        prohibitions text,
        coexistence_rules text,
        renewal_terms text,
        termination_terms text,
        special_clauses jsonb DEFAULT '[]',
        jurisdiction character varying DEFAULT 'Bolivia',
        pdf_url character varying,
        is_signed boolean DEFAULT false,
        bank_account_number character varying,
        bank_account_type character varying,
        bank_name character varying,
        bank_account_holder character varying,
        auto_renew boolean DEFAULT false,
        renewal_notice_days integer DEFAULT 30,
        auto_increase_percentage decimal(5,2) DEFAULT 0,
        previous_contract_id integer,
        application_id integer,
        termination_reason text,
        applied_penalty decimal(10,2),
        returned_deposit decimal(10,2),
        terminated_by character varying,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT fk_contracts_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id),
        CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id)
          REFERENCES ${quoteIdent(schemaName)}."user"(id),
        CONSTRAINT fk_contracts_application FOREIGN KEY (application_id)
          REFERENCES ${quoteIdent(schemaName)}.rental_applications(id) ON DELETE SET NULL
      );
    `);

    // Tabla: contract_history
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.contract_history (
        id SERIAL PRIMARY KEY,
        contract_id integer NOT NULL,
        field_modified character varying NOT NULL,
        old_value text,
        new_value text,
        modified_by integer NOT NULL,
        reason text,
        change_date timestamp with time zone DEFAULT now(),
        CONSTRAINT fk_history_contract FOREIGN KEY (contract_id)
          REFERENCES ${quoteIdent(schemaName)}.contracts(id) ON DELETE CASCADE
      );
    `);

    // Índices para contratos
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_TENANT ON ${quoteIdent(schemaName)}.contracts(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_PROPERTY ON ${quoteIdent(schemaName)}.contracts(property_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_STATUS ON ${quoteIdent(schemaName)}.contracts(status);
      CREATE INDEX IF NOT EXISTS IDX_HISTORY_CONTRACT ON ${quoteIdent(schemaName)}.contract_history(contract_id);
    `);
  }

  private async migratePropertyCatalog(schemaName: string) {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_types (
        id SERIAL PRIMARY KEY,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_subtypes (
        id SERIAL PRIMARY KEY,
        property_type_id integer NOT NULL,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_subtypes_type FOREIGN KEY (property_type_id)
          REFERENCES ${quoteIdent(schemaName)}.property_types(id)
      );
    `);

    // Ensure unique index exists on code (idempotent — handles tenants created without it)
    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_property_types_code
        ON ${quoteIdent(schemaName)}.property_types (code);
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_property_subtypes_code
        ON ${quoteIdent(schemaName)}.property_subtypes (code);
    `);

    await this.dataSource.query(`
      INSERT INTO ${quoteIdent(schemaName)}.property_types (name, code, is_active, created_at, updated_at)
      VALUES
        ('Residencial', 'RESIDENTIAL', true, NOW(), NOW()),
        ('Comercial',   'COMMERCIAL',  true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `);

    const types: { id: number; code: string }[] = await this.dataSource.query(`
      SELECT id, code FROM ${quoteIdent(schemaName)}.property_types
      WHERE code IN ('RESIDENTIAL', 'COMMERCIAL')
    `);

    const residential = types.find((t) => t.code === 'RESIDENTIAL');
    const commercial = types.find((t) => t.code === 'COMMERCIAL');

    if (!residential || !commercial) return;

    await this.dataSource.query(
      `
      INSERT INTO ${quoteIdent(schemaName)}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
      VALUES
        ($1, 'Condominio/Townhouse', 'CONDO_TOWNHOME', true, NOW(), NOW()),
        ($1, 'Multifamiliar',        'MULTI_FAMILY',   true, NOW(), NOW()),
        ($1, 'Unifamiliar',          'SINGLE_FAMILY',  true, NOW(), NOW()),
        ($2, 'Industrial',           'INDUSTRIAL',     true, NOW(), NOW()),
        ($2, 'Oficina',              'OFFICE',         true, NOW(), NOW()),
        ($2, 'Alquiler',             'RENTAL',         true, NOW(), NOW()),
        ($2, 'Centro Comercial',     'SHOPPING_CENTER',true, NOW(), NOW()),
        ($2, 'Bodega/Depósito',      'STORAGE',        true, NOW(), NOW()),
        ($2, 'Estacionamiento',      'PARKING_SPACE',  true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `,
      [residential.id, commercial.id],
    );
  }

  private async seedPropertyTypesAndSubtypes(schemaName: string) {
    // Insertar Property Types
    await this.dataSource.query(`
      INSERT INTO ${quoteIdent(schemaName)}.property_types (name, code, is_active, created_at, updated_at)
      VALUES
        ('Residencial', 'RESIDENTIAL', true, NOW(), NOW()),
        ('Comercial', 'COMMERCIAL', true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `);

    // Obtener los IDs de los tipos insertados
    const types: { id: number; code: string }[] = await this.dataSource.query(`
      SELECT id, code FROM ${quoteIdent(schemaName)}.property_types WHERE code IN ('RESIDENTIAL', 'COMMERCIAL')
    `);

    const residential = types.find((t) => t.code === 'RESIDENTIAL');
    const commercial = types.find((t) => t.code === 'COMMERCIAL');

    if (!residential || !commercial) {
      throw new Error('Failed to seed property types: Essential types missing');
    }

    const residentialId = residential.id;
    const commercialId = commercial.id;

    // Insertar Property Subtypes para RESIDENTIAL
    await this.dataSource.query(
      `
      INSERT INTO ${quoteIdent(schemaName)}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
      VALUES
        ($1, 'Condominio/Townhouse', 'CONDO_TOWNHOME', true, NOW(), NOW()),
        ($1, 'Multifamiliar', 'MULTI_FAMILY', true, NOW(), NOW()),
        ($1, 'Unifamiliar', 'SINGLE_FAMILY', true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `,
      [residentialId],
    );

    // Insertar Property Subtypes para COMERCIAL
    await this.dataSource.query(
      `
      INSERT INTO ${quoteIdent(schemaName)}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
      VALUES
        ($1, 'Industrial', 'INDUSTRIAL', true, NOW(), NOW()),
        ($1, 'Oficina', 'OFFICE', true, NOW(), NOW()),
        ($1, 'Alquiler', 'RENTAL', true, NOW(), NOW()),
        ($1, 'Centro Comercial', 'SHOPPING_CENTER', true, NOW(), NOW()),
        ($1, 'Bodega/Depósito', 'STORAGE', true, NOW(), NOW()),
        ($1, 'Estacionamiento', 'PARKING_SPACE', true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `,
      [commercialId],
    );
  }

  private async createMaintenanceTables(schemaName: string) {
    // ENUMs para Maintenance
    // ENUM de request_type
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.maintenance_request_type_enum AS ENUM ('MAINTENANCE', 'GENERAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_category
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.maintenance_category_enum AS ENUM ('GENERAL', 'ACCESORIOS', 'ELECTRICO', 'CLIMATIZACION', 'LLAVE_CERRADURA', 'ILUMINACION', 'AFUERA', 'PLOMERIA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de permission_to_enter
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.permission_to_enter_enum AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.maintenance_status_enum AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_priority
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.maintenance_priority_enum AS ENUM ('LOW', 'NORMAL', 'HIGH');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: maintenance_requests
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.maintenance_requests (
        id SERIAL PRIMARY KEY,
        ticket_number character varying NOT NULL UNIQUE,
        request_type ${quoteIdent(schemaName)}.maintenance_request_type_enum NOT NULL DEFAULT 'MAINTENANCE',
        category ${quoteIdent(schemaName)}.maintenance_category_enum,
        title character varying NOT NULL,
        description text NOT NULL,
        permission_to_enter ${quoteIdent(schemaName)}.permission_to_enter_enum NOT NULL DEFAULT 'NOT_APPLICABLE',
        has_pets boolean NOT NULL DEFAULT false,
        entry_notes text,
        status ${quoteIdent(schemaName)}.maintenance_status_enum NOT NULL DEFAULT 'NEW',
        priority ${quoteIdent(schemaName)}.maintenance_priority_enum NOT NULL DEFAULT 'NORMAL',
        due_date date,
        assigned_to integer,
        tenant_id integer NOT NULL,
        contract_id integer NOT NULL,
        property_id integer NOT NULL,
        current_stage VARCHAR(30) NOT NULL DEFAULT 'REPORTED',
        owner_authorized BOOLEAN NOT NULL DEFAULT FALSE,
        completed_at TIMESTAMPTZ,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_requests_contract FOREIGN KEY (contract_id)
          REFERENCES ${quoteIdent(schemaName)}.contracts(id),
        CONSTRAINT fk_maintenance_requests_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id)
      );
    `);

    // Tabla: maintenance_messages
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.maintenance_messages (
        id SERIAL PRIMARY KEY,
        maintenance_request_id integer NOT NULL,
        user_id integer NOT NULL,
        message text NOT NULL,
        send_to_resident boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_messages_request FOREIGN KEY (maintenance_request_id)
          REFERENCES ${quoteIdent(schemaName)}.maintenance_requests(id) ON DELETE CASCADE
      );
    `);

    // Tabla: maintenance_attachments
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.maintenance_attachments (
        id SERIAL PRIMARY KEY,
        maintenance_request_id integer,
        message_id integer,
        file_url character varying NOT NULL,
        file_name character varying NOT NULL,
        file_type character varying NOT NULL,
        file_size bigint NOT NULL,
        uploaded_by integer NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_attachments_request FOREIGN KEY (maintenance_request_id)
          REFERENCES ${quoteIdent(schemaName)}.maintenance_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_maintenance_attachments_message FOREIGN KEY (message_id)
          REFERENCES ${quoteIdent(schemaName)}.maintenance_messages(id) ON DELETE CASCADE
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TENANT ON ${quoteIdent(schemaName)}.maintenance_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_CONTRACT ON ${quoteIdent(schemaName)}.maintenance_requests(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PROPERTY ON ${quoteIdent(schemaName)}.maintenance_requests(property_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_STATUS ON ${quoteIdent(schemaName)}.maintenance_requests(status);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PRIORITY ON ${quoteIdent(schemaName)}.maintenance_requests(priority);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TYPE ON ${quoteIdent(schemaName)}.maintenance_requests(request_type);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_MESSAGES_REQUEST ON ${quoteIdent(schemaName)}.maintenance_messages(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_REQUEST ON ${quoteIdent(schemaName)}.maintenance_attachments(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_MESSAGE ON ${quoteIdent(schemaName)}.maintenance_attachments(message_id);
    `);

    // Tabla: maintenance_stage_history
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.maintenance_stage_history (
        id                   SERIAL PRIMARY KEY,
        request_id           INTEGER NOT NULL
          REFERENCES ${quoteIdent(schemaName)}.maintenance_requests(id) ON DELETE CASCADE,
        from_stage           VARCHAR(30),
        to_stage             VARCHAR(30) NOT NULL,
        changed_by_user_id   INTEGER NOT NULL,
        notes                TEXT,
        photos               JSONB NOT NULL DEFAULT '[]',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_STAGE_HISTORY_REQUEST
        ON ${quoteIdent(schemaName)}.maintenance_stage_history(request_id);
    `);
  }

  private async createNotificationsTables(schemaName: string) {
    const enumValuesSql = this.notificationEventTypes
      .map((eventType) => `'${eventType.replace(/'/g, "''")}'`)
      .join(',\n          ');

    // ENUM de notification_event_type
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.notification_event_type_enum AS ENUM (
          ${enumValuesSql}
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: notifications
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.notifications (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL,
        event_type ${quoteIdent(schemaName)}.notification_event_type_enum NOT NULL,
        title character varying(255) NOT NULL,
        message text NOT NULL,
        metadata jsonb DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        is_read boolean NOT NULL DEFAULT false,
        read_at TIMESTAMP,
        created_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Tabla: notification_templates
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.notification_templates (
        id SERIAL PRIMARY KEY,
        event_type ${quoteIdent(schemaName)}.notification_event_type_enum NOT NULL UNIQUE,
        title_template character varying(255) NOT NULL,
        message_template text NOT NULL,
        variables text[] DEFAULT '{}',
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_USER_ID ON ${quoteIdent(schemaName)}.notifications(user_id);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_EVENT_TYPE ON ${quoteIdent(schemaName)}.notifications(event_type);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_IS_READ ON ${quoteIdent(schemaName)}.notifications(is_read);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_CREATED_AT ON ${quoteIdent(schemaName)}.notifications(created_at DESC);
    `);
  }

  private async createApplicationsTables(schemaName: string) {
    // ENUM de application_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${quoteIdent(schemaName)}.application_status_enum AS ENUM (
          'BORRADOR', 'PENDIENTE', 'EN_REVISION', 'APROBADA', 'RECHAZADA', 'CANCELADA'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: rental_applications
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.rental_applications (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        applicant_id integer NOT NULL,
        status ${quoteIdent(schemaName)}.application_status_enum NOT NULL DEFAULT 'PENDIENTE',
        personal_data jsonb,
        employment_data jsonb,
        rental_history jsonb,
        "references" jsonb,
        documents jsonb,
        additional_notes text,
        admin_feedback text,
        screening_fee_paid BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_rental_applications_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id),
        CONSTRAINT fk_rental_applications_applicant FOREIGN KEY (applicant_id)
          REFERENCES ${quoteIdent(schemaName)}."user"(id)
      );
    `);

    // Crear índices
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_PROPERTY ON ${quoteIdent(schemaName)}.rental_applications(property_id);
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_APPLICANT ON ${quoteIdent(schemaName)}.rental_applications(applicant_id);
      CREATE INDEX IF NOT EXISTS IDX_APPLICATIONS_STATUS ON ${quoteIdent(schemaName)}.rental_applications(status);
    `);
  }

  private async createPaymentsTables(schemaName: string) {
    // Tabla: payments
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.payments (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        contract_id INTEGER NOT NULL,
        property_id INTEGER NOT NULL,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        payment_type VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
        payment_date DATE NOT NULL,
        due_date DATE,
        processed_date TIMESTAMP,
        reference_number VARCHAR(100),
        transaction_id VARCHAR(255),
        check_number VARCHAR(50),
        payment_processor VARCHAR(50) DEFAULT 'manual',
        processor_fee DECIMAL(10, 2) DEFAULT 0,
        proof_file VARCHAR(255),
        receipt_file VARCHAR(255),
        notes TEXT,
        admin_notes TEXT,
        rejection_reason TEXT,
        is_partial_payment BOOLEAN DEFAULT false,
        parent_payment_id INTEGER REFERENCES ${quoteIdent(schemaName)}.payments(id) ON DELETE SET NULL,
        is_recurring BOOLEAN DEFAULT false,
        recurring_schedule_id INTEGER,
        is_autopay BOOLEAN DEFAULT false,
        created_by INTEGER,
        approved_by INTEGER,
        approved_at TIMESTAMP,
        metadata JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_payments_contract FOREIGN KEY (contract_id)
          REFERENCES ${quoteIdent(schemaName)}.contracts(id),
        CONSTRAINT fk_payments_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id)
      );
    `);

    // Tabla: payment_schedules
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.payment_schedules (
        id SERIAL PRIMARY KEY,
        tenant_id INTEGER NOT NULL,
        contract_id INTEGER NOT NULL,
        property_id INTEGER NOT NULL,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount >= 0),
        currency VARCHAR(3) NOT NULL DEFAULT 'BOB',
        payment_type VARCHAR(50) NOT NULL,
        payment_method VARCHAR(50) NOT NULL,
        frequency VARCHAR(20) NOT NULL,
        start_date DATE NOT NULL,
        end_date DATE,
        day_of_month INTEGER CHECK (day_of_month >= 1 AND day_of_month <= 31),
        is_active BOOLEAN DEFAULT true,
        last_payment_date DATE,
        next_payment_date DATE,
        autopay_enabled BOOLEAN DEFAULT false,
        autopay_method VARCHAR(50),
        autopay_token VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT fk_payment_schedules_contract FOREIGN KEY (contract_id)
          REFERENCES ${quoteIdent(schemaName)}.contracts(id),
        CONSTRAINT fk_payment_schedules_property FOREIGN KEY (property_id)
          REFERENCES ${quoteIdent(schemaName)}.properties(id)
      );
    `);

    // Tabla: payment_refunds
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.payment_refunds (
        id SERIAL PRIMARY KEY,
        payment_id INTEGER NOT NULL REFERENCES ${quoteIdent(schemaName)}.payments(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        reason TEXT,
        refund_method VARCHAR(50),
        refund_date DATE NOT NULL,
        transaction_id VARCHAR(255),
        processed_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TENANT ON ${quoteIdent(schemaName)}.payments(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CONTRACT ON ${quoteIdent(schemaName)}.payments(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_PROPERTY ON ${quoteIdent(schemaName)}.payments(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_STATUS ON ${quoteIdent(schemaName)}.payments(status);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_DATE ON ${quoteIdent(schemaName)}.payments(payment_date);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CREATED_AT ON ${quoteIdent(schemaName)}.payments(created_at);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TYPE ON ${quoteIdent(schemaName)}.payments(payment_type);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_METHOD ON ${quoteIdent(schemaName)}.payments(payment_method);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_TENANT ON ${quoteIdent(schemaName)}.payment_schedules(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_CONTRACT ON ${quoteIdent(schemaName)}.payment_schedules(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_ACTIVE ON ${quoteIdent(schemaName)}.payment_schedules(is_active);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_REFUNDS_PAYMENT ON ${quoteIdent(schemaName)}.payment_refunds(payment_id);
    `);

    // Tabla: payment_splits — distribución del pago entre propietarios
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.payment_splits (
        id               SERIAL PRIMARY KEY,
        payment_id       INTEGER NOT NULL
          REFERENCES ${quoteIdent(schemaName)}.payments(id) ON DELETE CASCADE,
        rental_owner_id  INTEGER NOT NULL,
        owner_name       VARCHAR(255),
        ownership_pct    INTEGER NOT NULL,
        amount           DECIMAL(12,2) NOT NULL,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SPLITS_PAYMENT
        ON ${quoteIdent(schemaName)}.payment_splits(payment_id);
    `);

    // Crear trigger para updated_at (si no existe)
    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION ${quoteIdent(schemaName)}.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON ${quoteIdent(schemaName)}.payments;
      CREATE TRIGGER update_payments_updated_at
          BEFORE UPDATE ON ${quoteIdent(schemaName)}.payments
          FOR EACH ROW
          EXECUTE FUNCTION ${quoteIdent(schemaName)}.update_updated_at_column();
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payment_schedules_updated_at ON ${quoteIdent(schemaName)}.payment_schedules;
      CREATE TRIGGER update_payment_schedules_updated_at
          BEFORE UPDATE ON ${quoteIdent(schemaName)}.payment_schedules
          FOR EACH ROW
          EXECUTE FUNCTION ${quoteIdent(schemaName)}.update_updated_at_column();
    `);
  }

  /** Agrega current_stage, owner_authorized y completed_at a maintenance_requests. */
  private async migrateMaintenanceStageFields(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.maintenance_requests
         ADD COLUMN IF NOT EXISTS current_stage VARCHAR(30) NOT NULL DEFAULT 'REPORTED'`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.maintenance_requests
         ADD COLUMN IF NOT EXISTS owner_authorized BOOLEAN NOT NULL DEFAULT FALSE`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.maintenance_requests
         ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ`,
    );
  }

  /** Crea la tabla maintenance_stage_history si no existe. */
  private async createMaintenanceStageHistoryTable(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.maintenance_stage_history (
        id                   SERIAL PRIMARY KEY,
        request_id           INTEGER NOT NULL
          REFERENCES ${quoteIdent(schemaName)}.maintenance_requests(id) ON DELETE CASCADE,
        from_stage           VARCHAR(30),
        to_stage             VARCHAR(30) NOT NULL,
        changed_by_user_id   INTEGER NOT NULL,
        notes                TEXT,
        photos               JSONB NOT NULL DEFAULT '[]',
        created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_stage_history_request_id
        ON ${quoteIdent(schemaName)}.maintenance_stage_history(request_id);
      CREATE INDEX IF NOT EXISTS idx_maintenance_stage_history_created_at
        ON ${quoteIdent(schemaName)}.maintenance_stage_history(created_at DESC);
    `);
  }

  private async createInspectionsTables(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.inspections (
        id                  SERIAL PRIMARY KEY,
        property_id         INTEGER NOT NULL
          REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        unit_id             INTEGER
          REFERENCES ${q}.units(id) ON DELETE SET NULL,
        contract_id         INTEGER
          REFERENCES ${q}.contracts(id) ON DELETE SET NULL,
        type                VARCHAR(20) NOT NULL,
        scheduled_date      DATE NOT NULL,
        completed_date      DATE,
        inspector_user_id   INTEGER
          REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        status              VARCHAR(20) NOT NULL DEFAULT 'scheduled',
        notes               TEXT,
        created_by          INTEGER NOT NULL,
        created_at          TIMESTAMP NOT NULL DEFAULT now(),
        updated_at          TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_inspections_type
          CHECK (type IN ('move_in', 'move_out', 'periodic')),
        CONSTRAINT chk_inspections_status
          CHECK (status IN ('scheduled', 'in_progress', 'completed'))
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.inspection_items (
        id            SERIAL PRIMARY KEY,
        inspection_id INTEGER NOT NULL
          REFERENCES ${q}.inspections(id) ON DELETE CASCADE,
        area          VARCHAR(30) NOT NULL,
        item_name     VARCHAR(200) NOT NULL,
        condition     VARCHAR(20) NOT NULL DEFAULT 'good',
        notes         TEXT,
        photos        JSONB NOT NULL DEFAULT '[]',
        created_at    TIMESTAMP NOT NULL DEFAULT now(),
        updated_at    TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT chk_inspection_items_area
          CHECK (area IN ('living_room', 'kitchen', 'bathroom', 'bedroom', 'exterior', 'other')),
        CONSTRAINT chk_inspection_items_condition
          CHECK (condition IN ('good', 'fair', 'poor', 'damaged'))
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_inspections_property_id
        ON ${q}.inspections(property_id);
      CREATE INDEX IF NOT EXISTS idx_inspections_contract_id
        ON ${q}.inspections(contract_id);
      CREATE INDEX IF NOT EXISTS idx_inspections_status
        ON ${q}.inspections(status);
      CREATE INDEX IF NOT EXISTS idx_inspections_type
        ON ${q}.inspections(type);
      CREATE INDEX IF NOT EXISTS idx_inspections_scheduled_date
        ON ${q}.inspections(scheduled_date DESC);
      CREATE INDEX IF NOT EXISTS idx_inspection_items_inspection_id
        ON ${q}.inspection_items(inspection_id);
    `);
  }

  private async createExpensesTables(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.expenses (
        id                     SERIAL PRIMARY KEY,
        property_id            INTEGER NOT NULL REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        unit_id                INTEGER REFERENCES ${q}.units(id) ON DELETE SET NULL,
        category               VARCHAR(50) NOT NULL,
        amount                 DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        currency               VARCHAR(3) NOT NULL DEFAULT 'USD',
        description            TEXT,
        date                   DATE NOT NULL,
        vendor_id              INTEGER,
        vendor_name            VARCHAR(255),
        receipt_url            VARCHAR(255),
        is_recurring           BOOLEAN DEFAULT FALSE,
        recurrence_interval    VARCHAR(20),
        recurrence_start_date  DATE,
        recurrence_end_date    DATE,
        recurring_expense_id   INTEGER,
        notes                  TEXT,
        created_by             INTEGER,
        updated_by             INTEGER,
        created_at             TIMESTAMP NOT NULL DEFAULT now(),
        updated_at             TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_expenses_property_id ON ${q}.expenses(property_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_unit_id ON ${q}.expenses(unit_id);
      CREATE INDEX IF NOT EXISTS idx_expenses_date ON ${q}.expenses(date);
      CREATE INDEX IF NOT EXISTS idx_expenses_category ON ${q}.expenses(category);
    `);
  }

  private async migrateExpensesTable(schemaName: string): Promise<void> {
    await this.createExpensesTables(schemaName);

    // Si ya existía la tabla con tenant_id, eliminarlo (limpieza post-refactor)
    try {
      await this.dataSource.query(
        `ALTER TABLE ${quoteIdent(schemaName)}.expenses DROP COLUMN IF EXISTS tenant_id`,
      );
    } catch {
      // Ignorar si falla
    }

    // Asegurar que tenant_config tenga la columna custom_expense_categories
    await this.dataSource.query(
      `ALTER TABLE ${quoteIdent(schemaName)}.tenant_config ADD COLUMN IF NOT EXISTS custom_expense_categories JSONB NOT NULL DEFAULT '[]'`,
    );
  }

  private async createViolationsTable(schemaName: string): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.violations (
        id              SERIAL PRIMARY KEY,
        property_id     INT          NOT NULL,
        unit_id         INT,
        tenant_id       INT          NOT NULL,
        type            VARCHAR(50)  NOT NULL,
        description     TEXT         NOT NULL,
        status          VARCHAR(20)  NOT NULL DEFAULT 'open',
        evidence_photos JSONB        NOT NULL DEFAULT '[]',
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        resolved_at     TIMESTAMPTZ,
        resolved_notes  TEXT,
        created_by      INT
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_property_id
        ON ${quoteIdent(schemaName)}.violations(property_id)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_tenant_id
        ON ${quoteIdent(schemaName)}.violations(tenant_id)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_violations_status
        ON ${quoteIdent(schemaName)}.violations(status)
    `);
  }

  private async createVendorsTable(schemaName: string): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.vendors (
        id             SERIAL        PRIMARY KEY,
        name           VARCHAR(200)  NOT NULL,
        specialty      VARCHAR(50)   NOT NULL,
        phone          VARCHAR(30),
        email          VARCHAR(200),
        address        TEXT,
        rate_per_hour  DECIMAL(10,2),
        rate_flat      DECIMAL(10,2),
        is_active      BOOLEAN       NOT NULL DEFAULT true,
        average_rating DECIMAL(3,2),
        notes          TEXT,
        created_by     INT,
        created_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
        updated_at     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_specialty
        ON ${quoteIdent(schemaName)}.vendors(specialty)
        WHERE is_active = true
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_vendors_active
        ON ${quoteIdent(schemaName)}.vendors(is_active)
    `);
  }

  private async migrateMaintenanceVendorFields(
    schemaName: string,
  ): Promise<void> {
    const table = `${quoteIdent(schemaName)}.maintenance_requests`;
    const alterations = [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_id             INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rating         INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rating_comment TEXT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rated_at       TIMESTAMPTZ`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS vendor_rated_by       INT`,
    ];
    for (const sql of alterations) {
      await this.dataSource.query(sql);
    }
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_maintenance_vendor_id
        ON ${quoteIdent(schemaName)}.maintenance_requests(vendor_id)
        WHERE vendor_id IS NOT NULL
    `);
  }

  private async migrateUnitsShortTermFields(schemaName: string): Promise<void> {
    const table = `${quoteIdent(schemaName)}.units`;
    const alterations = [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS min_nights     INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS max_nights     INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checkin_time   VARCHAR(5)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checkout_time  VARCHAR(5)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS cleaning_fee   DECIMAL(10,2)`,
    ];
    for (const sql of alterations) {
      await this.dataSource.query(sql);
    }
  }

  private async createPropertyAvailabilityTable(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.property_availability (
        id             SERIAL      PRIMARY KEY,
        property_id    INT         NOT NULL,
        unit_id        INT         NOT NULL,
        date           DATE        NOT NULL,
        status         VARCHAR(20) NOT NULL DEFAULT 'available',
        reservation_id INT,
        blocked_by     INT,
        notes          TEXT,
        created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_availability_unit_date UNIQUE (unit_id, date)
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_property_month
        ON ${quoteIdent(schemaName)}.property_availability(property_id, date)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_unit_date
        ON ${quoteIdent(schemaName)}.property_availability(unit_id, date)
    `);
  }

  private async createReservationsTable(schemaName: string): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.reservations (
        id               SERIAL       PRIMARY KEY,
        property_id      INT          NOT NULL,
        unit_id          INT          NOT NULL,
        tenant_id        INT          NOT NULL,
        checkin_date     DATE         NOT NULL,
        checkout_date    DATE         NOT NULL,
        nights           INT          NOT NULL,
        price_per_night  DECIMAL(10,2) NOT NULL,
        cleaning_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_amount     DECIMAL(10,2) NOT NULL,
        currency         VARCHAR(10)  NOT NULL DEFAULT 'BOB',
        status           VARCHAR(20)  NOT NULL DEFAULT 'confirmed',
        notes            TEXT,
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_unit_dates
        ON ${quoteIdent(schemaName)}.reservations(unit_id, checkin_date, checkout_date)
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_tenant
        ON ${quoteIdent(schemaName)}.reservations(tenant_id)
    `);
  }

  private async createLifecycleNotificationLog(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.lifecycle_notification_log (
        id            SERIAL PRIMARY KEY,
        entity_type   VARCHAR(50)  NOT NULL,
        entity_id     INTEGER      NOT NULL,
        event_key     VARCHAR(100) NOT NULL,
        sent_at       TIMESTAMP    NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_lifecycle_notif_log UNIQUE (entity_id, entity_type, event_key)
      )
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_lifecycle_notif_log_entity
        ON ${quoteIdent(schemaName)}.lifecycle_notification_log(entity_type, entity_id)
    `);
  }

  private async createContractTemplatesTable(
    schemaName: string,
  ): Promise<void> {
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${quoteIdent(schemaName)}.contract_templates (
        id           SERIAL PRIMARY KEY,
        language     VARCHAR(5)   NOT NULL,
        name         VARCHAR(200) NOT NULL,
        content      TEXT         NOT NULL,
        is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
      );
    `);

    // Índice para búsqueda por idioma
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_templates_language
        ON ${quoteIdent(schemaName)}.contract_templates(language);
    `);

    // Plantilas por defecto — solo si la tabla está vacía
    const existingRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${quoteIdent(schemaName)}.contract_templates`,
    );
    if (Number(existingRows[0]?.count ?? 0) > 0) return;

    const esContent = `CONTRATO DE ARRENDAMIENTO
Contrato N°: {{contract_number}}
Fecha de emisión: {{issue_date}}

PARTES DEL CONTRATO

ARRENDADOR:
Nombre: {{landlord_name}}

ARRENDATARIO (INQUILINO):
Nombre: {{tenant_name}}
Email: {{tenant_email}}
Teléfono: {{tenant_phone}}

PROPIEDAD:
Nombre: {{property_title}}
Dirección: {{property_address}}
Unidad: {{unit_number}}

CLÁUSULAS DEL CONTRATO

PRIMERA. OBJETO DEL CONTRATO
El Arrendador cede en arrendamiento al Arrendatario la propiedad descrita anteriormente para uso exclusivamente residencial.

SEGUNDA. DURACIÓN
El presente contrato tendrá una duración de {{duration_months}} meses, iniciando el {{start_date}} y finalizando el {{end_date}}.

TERCERA. RENTA MENSUAL
El monto del alquiler mensual es de {{rent_amount}} {{currency}}, pagaderos los días {{payment_day}} de cada mes.

CUARTA. DEPÓSITO DE GARANTÍA
El Arrendatario entrega en este acto la suma de {{deposit_amount}} {{currency}} en concepto de depósito de garantía.

QUINTA. MORA
En caso de pago tardío, se aplicará una mora del {{late_fee_percentage}}% con un período de gracia de {{grace_days}} días calendario.

SEXTA. JURISDICCIÓN
Para cualquier conflicto legal, las partes se someten a la jurisdicción de {{jurisdiction}}.



________________________           ________________________
Firma del Arrendatario              Firma del Arrendador`;

    const enContent = `RENTAL AGREEMENT
Contract No.: {{contract_number}}
Issue Date: {{issue_date}}

PARTIES

LANDLORD:
Name: {{landlord_name}}

TENANT:
Name: {{tenant_name}}
Email: {{tenant_email}}
Phone: {{tenant_phone}}

PROPERTY:
Title: {{property_title}}
Address: {{property_address}}
Unit: {{unit_number}}

TERMS AND CONDITIONS

1. OBJECT
The Landlord leases to the Tenant the above-described property for residential use only.

2. TERM
This agreement shall be in effect for {{duration_months}} months, commencing {{start_date}} and ending {{end_date}}.

3. RENT
The monthly rent is {{rent_amount}} {{currency}}, due on day {{payment_day}} of each month.

4. SECURITY DEPOSIT
The Tenant deposits {{deposit_amount}} {{currency}} as a security deposit.

5. LATE FEES
A late fee of {{late_fee_percentage}}% will be applied after a grace period of {{grace_days}} calendar days.

6. JURISDICTION
Any disputes shall be resolved under the jurisdiction of {{jurisdiction}}.



________________________           ________________________
Tenant Signature                    Landlord Signature`;

    await this.dataSource.query(
      `INSERT INTO ${quoteIdent(schemaName)}.contract_templates
         (language, name, content, is_active)
       VALUES
         ('es', 'Contrato de Arrendamiento Estándar (ES)', $1, true),
         ('en', 'Standard Rental Agreement (EN)', $2, true)`,
      [esContent, enContent],
    );
  }

  private async createAuditLogsTable(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.audit_logs (
        id          SERIAL PRIMARY KEY,
        user_id     INTEGER NOT NULL,
        action      VARCHAR(30) NOT NULL,
        entity_type VARCHAR(50) NOT NULL,
        entity_id   INTEGER NOT NULL,
        old_values  JSONB,
        new_values  JSONB,
        ip_address  VARCHAR(45),
        user_agent  VARCHAR(500),
        timestamp   TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_audit_logs_entity
        ON ${q}.audit_logs(entity_type, entity_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id
        ON ${q}.audit_logs(user_id);
      CREATE INDEX IF NOT EXISTS idx_audit_logs_action
        ON ${q}.audit_logs(action);
    `);
  }

  private async createTenantWebsiteTable(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.tenant_website (
        id                  SERIAL PRIMARY KEY,
        subdomain           VARCHAR(100) UNIQUE,
        company_description TEXT,
        logo_url            VARCHAR(500),
        primary_color       VARCHAR(7)   NOT NULL DEFAULT '#1976d2',
        secondary_color     VARCHAR(7)   NOT NULL DEFAULT '#424242',
        contact_email       VARCHAR(255),
        contact_phone       VARCHAR(50),
        social_links        JSONB        NOT NULL DEFAULT '{}',
        meta_title          VARCHAR(200),
        meta_description    VARCHAR(500),
        is_published        BOOLEAN      NOT NULL DEFAULT false,
        created_at          TIMESTAMP    NOT NULL DEFAULT now(),
        updated_at          TIMESTAMP    NOT NULL DEFAULT now()
      );
    `);
  }

  private async createWebsiteContactsTable(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.website_contacts (
        id         SERIAL PRIMARY KEY,
        name       VARCHAR(255) NOT NULL,
        email      VARCHAR(255) NOT NULL,
        phone      VARCHAR(50),
        message    TEXT         NOT NULL,
        status     VARCHAR(50)  NOT NULL DEFAULT 'PENDING',
        user_ip    VARCHAR(45),
        created_at TIMESTAMP    NOT NULL DEFAULT now(),
        updated_at TIMESTAMP    NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_website_contacts_email
        ON ${q}.website_contacts(email);
      CREATE INDEX IF NOT EXISTS idx_website_contacts_status
        ON ${q}.website_contacts(status);
      CREATE INDEX IF NOT EXISTS idx_website_contacts_created_at
        ON ${q}.website_contacts(created_at DESC);
    `);
  }

  private async dropTenantSchema(tenant: Tenant) {
    try {
      // Eliminar el schema de PostgreSQL (CASCADE elimina todas las tablas)
      await this.dataSource.query(
        `DROP SCHEMA IF EXISTS ${quoteIdent(tenant.schema_name)} CASCADE`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to drop schema: ${message}`);
    }
  }
}
