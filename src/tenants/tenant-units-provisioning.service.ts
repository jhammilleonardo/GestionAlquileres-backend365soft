import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantUnitsProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureUnits(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.unit_status_enum AS ENUM (
          'available', 'occupied', 'maintenance', 'reserved'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.unit_rental_type_enum AS ENUM (
          'SHORT_TERM', 'LONG_TERM', 'BOTH'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.units (
        id             SERIAL PRIMARY KEY,
        property_id    INTEGER NOT NULL,
        unit_number    VARCHAR(50) NOT NULL,
        floor          INTEGER,
        bedrooms       INTEGER,
        bathrooms      INTEGER,
        square_meters  NUMERIC(10,2),
        status         ${q}.unit_status_enum NOT NULL DEFAULT 'available',
        rental_type    ${q}.unit_rental_type_enum,
        price_per_month  NUMERIC(10,2),
        price_per_night  NUMERIC(10,2),
        deposit_amount   NUMERIC(10,2),
        features         JSONB,
        created_at     TIMESTAMP NOT NULL DEFAULT now(),
        updated_at     TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_units_property
          FOREIGN KEY (property_id) REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        CONSTRAINT uq_units_property_number
          UNIQUE (property_id, unit_number)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_units_property_id
        ON ${q}.units(property_id);
      CREATE INDEX IF NOT EXISTS idx_units_status
        ON ${q}.units(status);
    `);
  }

  async ensureShortTermFields(schemaName: string): Promise<void> {
    const table = `${quoteIdent(schemaName)}.units`;
    const alterations = [
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS min_nights     INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS max_nights     INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checkin_time   VARCHAR(5)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS checkout_time  VARCHAR(5)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS cleaning_fee   DECIMAL(10,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS weekly_discount_pct  DECIMAL(5,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS monthly_discount_pct DECIMAL(5,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS weekend_adjustment_pct DECIMAL(6,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS early_bird_min_days INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS early_bird_discount_pct DECIMAL(5,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS last_minute_max_days INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS last_minute_adjustment_pct DECIMAL(6,2)`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS advance_notice_days INT`,
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS max_advance_days INT`,
      // Modo de reserva OTA: 'instant' (auto-confirma) | 'request' (queda
      // PENDING a la espera de que el admin confirme antes de que expire).
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS booking_mode VARCHAR(20) NOT NULL DEFAULT 'instant'`,
      // Política de cancelación: flexible | moderate | strict | non_refundable.
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS cancellation_policy VARCHAR(20) NOT NULL DEFAULT 'moderate'`,
      // Adelanto requerido para confirmar la reserva, como % del total (0-100).
      // NULL = se exige el pago completo (comportamiento por defecto).
      `ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS deposit_to_confirm_pct DECIMAL(5,2)`,
    ];

    for (const sql of alterations) {
      await this.dataSource.query(sql);
    }
  }

  async ensurePropertyAvailability(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_availability (
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
        ON ${q}.property_availability(property_id, date)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_unit_date
        ON ${q}.property_availability(unit_id, date)
    `);
  }

  async ensureReservations(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.reservations (
        id               SERIAL       PRIMARY KEY,
        property_id      INT          NOT NULL,
        unit_id          INT          NOT NULL,
        tenant_id        INT          NOT NULL,
        checkin_date     DATE         NOT NULL,
        checkout_date    DATE         NOT NULL,
        nights           INT          NOT NULL,
        price_per_night  DECIMAL(10,2) NOT NULL,
        cleaning_fee     DECIMAL(10,2) NOT NULL DEFAULT 0,
        security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0,
        total_amount     DECIMAL(10,2) NOT NULL,
        currency         VARCHAR(10)  NOT NULL DEFAULT 'BOB',
        status           VARCHAR(20)  NOT NULL DEFAULT 'confirmed',
        notes            TEXT,
        pricing_snapshot JSONB,
        expires_at       TIMESTAMPTZ,
        idempotency_key  VARCHAR(100),
        created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    // Depósito de garantía: ALTER idempotente para tenants cuya tabla se creó
    // antes de añadir la columna.
    await this.dataSource.query(
      `ALTER TABLE ${q}.reservations
         ADD COLUMN IF NOT EXISTS security_deposit DECIMAL(10,2) NOT NULL DEFAULT 0`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${q}.reservations ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${q}.reservations ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${q}.reservations ADD COLUMN IF NOT EXISTS idempotency_key VARCHAR(100)`,
    );
    // Adelanto requerido para confirmar (snapshot al crear). NULL = pago completo.
    await this.dataSource.query(
      `ALTER TABLE ${q}.reservations ADD COLUMN IF NOT EXISTS deposit_required DECIMAL(10,2)`,
    );

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_unit_dates
        ON ${q}.reservations(unit_id, checkin_date, checkout_date)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_tenant
        ON ${q}.reservations(tenant_id)
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_reservations_tenant_idempotency
        ON ${q}.reservations(tenant_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_pending_expiry
        ON ${q}.reservations(expires_at)
        WHERE status IN ('pending', 'pending_payment')
    `);
  }

  /**
   * Defensa a nivel motor contra doble-booking: una exclusion constraint impide
   * dos reservas ocupantes que solapen en la misma unidad. Requiere la extensión
   * btree_gist (igualdad de enteros + rango de fechas en un índice gist).
   *
   * Best-effort: si el rol no puede crear la extensión, o si datos legados ya
   * tienen solapes, se omite con NOTICE en vez de romper el arranque. La garantía
   * principal de ocupación única vive en la reclamación atómica del servicio.
   *
   * Versionado del nombre (`_v3`): incorpora la retención de pago como estado
   * ocupante. Se eliminan las versiones anteriores antes de crear la actual.
   */
  /**
   * Reseñas de estadía: una por reserva (UNIQUE), sólo sobre reservas
   * completadas. La FK a reservations con ON DELETE CASCADE limpia la reseña si
   * la reserva se elimina; rating acotado 1–5 por CHECK.
   */
  async ensureReviews(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.reviews (
        id             SERIAL       PRIMARY KEY,
        reservation_id INT          NOT NULL UNIQUE
          REFERENCES ${q}.reservations(id) ON DELETE CASCADE,
        tenant_id      INT          NOT NULL,
        property_id    INT          NOT NULL,
        unit_id        INT          NOT NULL,
        rating         INT          NOT NULL CHECK (rating BETWEEN 1 AND 5),
        comment        TEXT,
        created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reviews_property
        ON ${q}.reviews(property_id)
    `);
  }

  /**
   * Tarifas por temporada: override de precio/noche y noches mínimas en un rango
   * de fechas por unidad. El servicio impide solapes para que cada noche resuelva
   * a una sola temporada.
   */
  async ensureSeasonRules(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.season_rules (
        id              SERIAL       PRIMARY KEY,
        unit_id         INT          NOT NULL
          REFERENCES ${q}.units(id) ON DELETE CASCADE,
        name            VARCHAR(120) NOT NULL,
        start_date      DATE         NOT NULL,
        end_date        DATE         NOT NULL,
        price_per_night DECIMAL(10,2),
        min_nights      INT,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        CHECK (end_date >= start_date)
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_season_rules_unit
        ON ${q}.season_rules(unit_id, start_date, end_date)
    `);
  }

  /**
   * Tareas de limpieza (housekeeping). Se generan al COMPLETAR una reserva,
   * programadas para su fecha de salida. `reservation_id` nullable permite
   * también tareas manuales no ligadas a una reserva.
   */
  async ensureHousekeepingTasks(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.housekeeping_tasks (
        id              SERIAL       PRIMARY KEY,
        property_id     INT          NOT NULL,
        unit_id         INT          NOT NULL,
        reservation_id  INT          REFERENCES ${q}.reservations(id) ON DELETE SET NULL,
        scheduled_date  DATE         NOT NULL,
        status          VARCHAR(20)  NOT NULL DEFAULT 'pending',
        assigned_to     INT,
        notes           TEXT,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
        updated_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_housekeeping_status_date
        ON ${q}.housekeeping_tasks(status, scheduled_date)
    `);
  }

  /**
   * Sincronización de calendarios externos (iCal). Cada unidad puede tener varias
   * URLs `.ics` de las que se importan fechas ocupadas como bloqueos. La columna
   * `sync_source_id` en `property_availability` marca los bloqueos importados para
   * poder re-sincronizar de forma idempotente.
   */
  async ensureCalendarSync(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.calendar_sync_sources (
        id              SERIAL       PRIMARY KEY,
        unit_id         INT          NOT NULL
          REFERENCES ${q}.units(id) ON DELETE CASCADE,
        name            VARCHAR(120) NOT NULL,
        url             TEXT         NOT NULL,
        last_synced_at  TIMESTAMPTZ,
        created_at      TIMESTAMPTZ  NOT NULL DEFAULT NOW()
      )
    `);

    await this.dataSource.query(
      `ALTER TABLE ${q}.property_availability
         ADD COLUMN IF NOT EXISTS sync_source_id INT`,
    );

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_availability_sync_source
        ON ${q}.property_availability(sync_source_id)
    `);
  }

  async ensureReservationOverlapGuard(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const schemaLiteral = `'${schemaName}'`;

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE EXTENSION IF NOT EXISTS btree_gist;

        ALTER TABLE ${q}.reservations
          DROP CONSTRAINT IF EXISTS excl_reservations_no_overlap;

        ALTER TABLE ${q}.reservations
          DROP CONSTRAINT IF EXISTS excl_reservations_no_overlap_v2;

        IF NOT EXISTS (
          SELECT 1
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
          WHERE n.nspname = ${schemaLiteral}
            AND c.conname = 'excl_reservations_no_overlap_v3'
        ) THEN
          ALTER TABLE ${q}.reservations
            ADD CONSTRAINT excl_reservations_no_overlap_v3
            EXCLUDE USING gist (
              unit_id WITH =,
              daterange(checkin_date, checkout_date, '[)') WITH &&
            ) WHERE (status IN ('pending_payment', 'pending', 'confirmed', 'in_progress'));
        END IF;
      EXCEPTION
        WHEN duplicate_object THEN NULL;
        WHEN insufficient_privilege THEN
          RAISE NOTICE 'btree_gist no disponible (sin privilegio); se omite la exclusion constraint de reservas';
        WHEN feature_not_supported THEN
          RAISE NOTICE 'Exclusion constraint no soportada; se omite la guarda de solape de reservas';
        WHEN exclusion_violation THEN
          RAISE NOTICE 'Existen reservas con solape previo; se omite la exclusion constraint (limpiar datos legados primero)';
      END $$;
    `);
  }
}
