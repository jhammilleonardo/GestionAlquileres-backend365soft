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
        ON ${q}.reservations(unit_id, checkin_date, checkout_date)
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_reservations_tenant
        ON ${q}.reservations(tenant_id)
    `);
  }
}
