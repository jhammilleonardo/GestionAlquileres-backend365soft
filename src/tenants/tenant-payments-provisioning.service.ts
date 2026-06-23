import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantPaymentsProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensurePayments(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.payments (
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
        parent_payment_id INTEGER REFERENCES ${q}.payments(id) ON DELETE SET NULL,
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
          REFERENCES ${q}.contracts(id),
        CONSTRAINT fk_payments_property FOREIGN KEY (property_id)
          REFERENCES ${q}.properties(id)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.payment_schedules (
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
          REFERENCES ${q}.contracts(id),
        CONSTRAINT fk_payment_schedules_property FOREIGN KEY (property_id)
          REFERENCES ${q}.properties(id)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.payment_refunds (
        id SERIAL PRIMARY KEY,
        payment_id INTEGER NOT NULL REFERENCES ${q}.payments(id) ON DELETE CASCADE,
        amount DECIMAL(12, 2) NOT NULL CHECK (amount > 0),
        reason TEXT,
        refund_method VARCHAR(50),
        refund_date DATE NOT NULL,
        transaction_id VARCHAR(255),
        processed_by INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.ensureWebhookEvents(schemaName);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TENANT ON ${q}.payments(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CONTRACT ON ${q}.payments(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_PROPERTY ON ${q}.payments(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_STATUS ON ${q}.payments(status);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_DATE ON ${q}.payments(payment_date);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CREATED_AT ON ${q}.payments(created_at);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TYPE ON ${q}.payments(payment_type);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_METHOD ON ${q}.payments(payment_method);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_TENANT ON ${q}.payment_schedules(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_CONTRACT ON ${q}.payment_schedules(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_ACTIVE ON ${q}.payment_schedules(is_active);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_REFUNDS_PAYMENT ON ${q}.payment_refunds(payment_id);
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.payment_splits (
        id               SERIAL PRIMARY KEY,
        payment_id       INTEGER NOT NULL
          REFERENCES ${q}.payments(id) ON DELETE CASCADE,
        rental_owner_id  INTEGER NOT NULL,
        owner_name       VARCHAR(255),
        ownership_pct    INTEGER NOT NULL,
        amount           DECIMAL(12,2) NOT NULL,
        created_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SPLITS_PAYMENT
        ON ${q}.payment_splits(payment_id);
    `);

    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION ${q}.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON ${q}.payments;
      CREATE TRIGGER update_payments_updated_at
          BEFORE UPDATE ON ${q}.payments
          FOR EACH ROW
          EXECUTE FUNCTION ${q}.update_updated_at_column();
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payment_schedules_updated_at ON ${q}.payment_schedules;
      CREATE TRIGGER update_payment_schedules_updated_at
          BEFORE UPDATE ON ${q}.payment_schedules
          FOR EACH ROW
          EXECUTE FUNCTION ${q}.update_updated_at_column();
    `);
  }

  /**
   * Habilita pagos polimórficos (§4.6): un pago se vincula EXACTAMENTE a un
   * contrato de largo plazo (`contract_id`) o a una reserva de corto plazo
   * (`reservation_id`), nunca a ambos ni a ninguno. Se ejecuta como paso
   * independiente DESPUÉS de `ensureReservations`, porque la FK necesita que la
   * tabla `reservations` ya exista. Idempotente para tenants existentes:
   * `contract_id` se vuelve nullable y `num_nonnulls(...)=1` arbitra la
   * exclusividad sin romper los pagos actuales (todos con contrato).
   */
  async ensureReservationPaymentSupport(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(
      `ALTER TABLE ${q}.payments ALTER COLUMN contract_id DROP NOT NULL`,
    );

    await this.dataSource.query(
      `ALTER TABLE ${q}.payments ADD COLUMN IF NOT EXISTS reservation_id INTEGER`,
    );

    // FK y CHECK no admiten IF NOT EXISTS: se envuelven en un bloque que ignora
    // el error de duplicado para que la migración sea re-ejecutable.
    await this.dataSource.query(`
      DO $$ BEGIN
        ALTER TABLE ${q}.payments
          ADD CONSTRAINT fk_payments_reservation
          FOREIGN KEY (reservation_id) REFERENCES ${q}.reservations(id)
          ON DELETE SET NULL;
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await this.dataSource.query(`
      DO $$ BEGIN
        ALTER TABLE ${q}.payments
          ADD CONSTRAINT chk_payments_link_exactly_one
          CHECK (num_nonnulls(contract_id, reservation_id) = 1);
      EXCEPTION WHEN duplicate_object THEN NULL; END $$;
    `);

    await this.dataSource.query(
      `CREATE INDEX IF NOT EXISTS idx_payments_reservation
         ON ${q}.payments(reservation_id)`,
    );
  }

  async ensureWebhookEvents(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.webhook_events (
        event_id     VARCHAR(255) PRIMARY KEY,
        processor    VARCHAR(50) NOT NULL,
        event_status VARCHAR(20),
        processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        raw_event    JSONB
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_webhook_events_processed_at
        ON ${q}.webhook_events(processed_at DESC);
    `);
  }

  async ensureOwnerStatements(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.owner_statements (
        id                    SERIAL PRIMARY KEY,
        rental_owner_id       INTEGER NOT NULL,
        property_id           INTEGER NOT NULL,
        unit_id               INTEGER REFERENCES ${q}.units(id) ON DELETE SET NULL,
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
      `ALTER TABLE ${q}.owner_statements
         ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'pending'`,
    );

    await this.dataSource.query(
      `ALTER TABLE ${q}.owner_statements
         ADD COLUMN IF NOT EXISTS transferred_at TIMESTAMP`,
    );

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_owner_statements_status
        ON ${q}.owner_statements(status);
    `);
  }
}
