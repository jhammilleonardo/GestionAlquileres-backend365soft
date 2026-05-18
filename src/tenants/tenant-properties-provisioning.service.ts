import { Injectable, Logger } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantPropertiesProvisioningService {
  private readonly logger = new Logger(
    TenantPropertiesProvisioningService.name,
  );

  constructor(private readonly dataSource: DataSource) {}

  async ensureProperties(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_types (
        id SERIAL PRIMARY KEY,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_subtypes (
        id SERIAL PRIMARY KEY,
        property_type_id integer NOT NULL,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_subtypes_type FOREIGN KEY (property_type_id)
          REFERENCES ${q}.property_types(id)
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.rental_owners (
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

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.properties (
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
          REFERENCES ${q}.property_types(id),
        CONSTRAINT fk_properties_subtype FOREIGN KEY (property_subtype_id)
          REFERENCES ${q}.property_subtypes(id),
        CONSTRAINT chk_properties_status
          CHECK (status IN ('DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'))
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_addresses (
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
          REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        CONSTRAINT chk_property_addresses_type
          CHECK (address_type IN ('address_1', 'address_2', 'address_3'))
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_owners (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        rental_owner_id integer NOT NULL,
        ownership_percentage integer NOT NULL DEFAULT 0,
        is_primary boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_owners_property FOREIGN KEY (property_id)
          REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_property_owners_owner FOREIGN KEY (rental_owner_id)
          REFERENCES ${q}.rental_owners(id),
        CONSTRAINT uq_property_owners_property_owner
          UNIQUE (property_id, rental_owner_id),
        CONSTRAINT chk_ownership_percentage
          CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100)
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_TYPE ON ${q}.properties(property_type_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_SUBTYPE ON ${q}.properties(property_subtype_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_STATUS ON ${q}.properties(status);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_ADDRESSES_PROPERTY ON ${q}.property_addresses(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_PROPERTY ON ${q}.property_owners(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_OWNER ON ${q}.property_owners(rental_owner_id);
    `);
  }

  async ensurePropertyColumns(schemaName: string): Promise<void> {
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

  async migrateImagesToJson(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const result = await this.dataSource.query<{ udt_name: string }[]>(
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
      return;
    }

    this.logger.log(`Migrating images column (text[] -> json) in ${q}`);
    await this.dataSource.query(
      `ALTER TABLE ${q}.properties ADD COLUMN IF NOT EXISTS images_json json DEFAULT '[]'`,
    );
    await this.dataSource.query(
      `UPDATE ${q}.properties SET images_json = to_json(images) WHERE images IS NOT NULL`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${q}.properties DROP COLUMN images`,
    );
    await this.dataSource.query(
      `ALTER TABLE ${q}.properties RENAME COLUMN images_json TO images`,
    );
  }

  async ensurePropertyLeads(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_leads (
        id SERIAL PRIMARY KEY,
        property_id INT NOT NULL REFERENCES ${q}.properties(id) ON DELETE CASCADE,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        message TEXT NOT NULL,
        inquiry_type VARCHAR(50) DEFAULT 'general',
        availability VARCHAR(50),
        status VARCHAR(50) DEFAULT 'PENDING',
        user_ip VARCHAR(45),
        assigned_to INT REFERENCES ${q}."user"(id) ON DELETE SET NULL,
        created_at TIMESTAMP DEFAULT NOW(),
        updated_at TIMESTAMP DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_property_leads_property_id ON ${q}.property_leads(property_id);
      CREATE INDEX IF NOT EXISTS idx_property_leads_email ON ${q}.property_leads(email);
      CREATE INDEX IF NOT EXISTS idx_property_leads_status ON ${q}.property_leads(status);
      CREATE INDEX IF NOT EXISTS idx_property_leads_created_at ON ${q}.property_leads(created_at DESC);
    `);
  }

  async ensureRentalOwnerBankFields(schemaName: string): Promise<void> {
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

  async ensurePropertyOwnersUniqueness(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DELETE FROM ${q}.property_owners po
      USING ${q}.property_owners duplicate
      WHERE po.property_id = duplicate.property_id
        AND po.rental_owner_id = duplicate.rental_owner_id
        AND po.id > duplicate.id;
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_property_owners_property_owner
        ON ${q}.property_owners(property_id, rental_owner_id);
    `);
  }

  async ensurePropertyCatalog(schemaName: string): Promise<void> {
    await this.ensurePropertyCatalogTables(schemaName);
    await this.seedPropertyCatalogRows(schemaName, false);
  }

  async seedPropertyTypesAndSubtypes(schemaName: string): Promise<void> {
    await this.seedPropertyCatalogRows(schemaName, true);
  }

  private async ensurePropertyCatalogTables(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_types (
        id SERIAL PRIMARY KEY,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.property_subtypes (
        id SERIAL PRIMARY KEY,
        property_type_id integer NOT NULL,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_subtypes_type FOREIGN KEY (property_type_id)
          REFERENCES ${q}.property_types(id)
      );
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_property_types_code
        ON ${q}.property_types (code);
    `);

    await this.dataSource.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_property_subtypes_code
        ON ${q}.property_subtypes (code);
    `);
  }

  private async seedPropertyCatalogRows(
    schemaName: string,
    throwIfMissing: boolean,
  ): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      INSERT INTO ${q}.property_types (name, code, is_active, created_at, updated_at)
      VALUES
        ('Residencial', 'RESIDENTIAL', true, NOW(), NOW()),
        ('Comercial',   'COMMERCIAL',  true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `);

    const types = await this.dataSource.query<
      Array<{ id: number; code: string }>
    >(
      `SELECT id, code FROM ${q}.property_types WHERE code IN ('RESIDENTIAL', 'COMMERCIAL')`,
    );

    const residential = types.find((t) => t.code === 'RESIDENTIAL');
    const commercial = types.find((t) => t.code === 'COMMERCIAL');

    if (!residential || !commercial) {
      if (throwIfMissing) {
        throw new Error(
          'Failed to seed property types: Essential types missing',
        );
      }
      return;
    }

    await this.dataSource.query(
      `
      INSERT INTO ${q}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
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
}
