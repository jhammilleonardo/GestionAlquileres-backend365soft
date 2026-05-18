import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';

@Injectable()
export class TenantContractsProvisioningService {
  constructor(private readonly dataSource: DataSource) {}

  async ensureContracts(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${q}.contract_status_enum AS ENUM (
          'BORRADOR', 'PENDIENTE', 'FIRMADO', 'ACTIVO',
          'POR_VENCER', 'VENCIDO', 'RENOVADO', 'FINALIZADO',
          'CANCELADO', 'SUSPENDIDO'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    await this.dataSource.query(
      `CREATE SEQUENCE IF NOT EXISTS ${q}.contract_number_seq`,
    );

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.contracts (
        id SERIAL PRIMARY KEY,
        contract_number character varying NOT NULL UNIQUE,
        tenant_id integer NOT NULL,
        property_id integer NOT NULL,
        status ${q}.contract_status_enum NOT NULL DEFAULT 'BORRADOR',
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
          REFERENCES ${q}.properties(id),
        CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id)
          REFERENCES ${q}."user"(id),
        CONSTRAINT fk_contracts_application FOREIGN KEY (application_id)
          REFERENCES ${q}.rental_applications(id) ON DELETE SET NULL
      );
    `);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.contract_history (
        id SERIAL PRIMARY KEY,
        contract_id integer NOT NULL,
        field_modified character varying NOT NULL,
        old_value text,
        new_value text,
        modified_by integer NOT NULL,
        reason text,
        change_date timestamp with time zone DEFAULT now(),
        CONSTRAINT fk_history_contract FOREIGN KEY (contract_id)
          REFERENCES ${q}.contracts(id) ON DELETE CASCADE
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_TENANT ON ${q}.contracts(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_PROPERTY ON ${q}.contracts(property_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_STATUS ON ${q}.contracts(status);
      CREATE INDEX IF NOT EXISTS IDX_HISTORY_CONTRACT ON ${q}.contract_history(contract_id);
    `);
  }

  async ensureApplicationId(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);
    const [tableExists] = await this.dataSource.query<{ exists: boolean }[]>(
      `SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = $1 AND table_name = 'rental_applications'
      )`,
      [schemaName],
    );

    if (!tableExists?.exists) {
      return;
    }

    await this.dataSource.query(
      `ALTER TABLE ${q}.contracts ADD COLUMN IF NOT EXISTS application_id INTEGER REFERENCES ${q}.rental_applications(id) ON DELETE SET NULL`,
    );
  }

  async ensureContractNumberSequence(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(
      `CREATE SEQUENCE IF NOT EXISTS ${q}.contract_number_seq`,
    );

    const maxRows = await this.dataSource.query<{ max_number: string }[]>(
      `
        SELECT COALESCE(MAX((match)[1]::integer), 0)::text AS max_number
        FROM (
          SELECT regexp_match(contract_number, '^CTR-[0-9]{4}-([0-9]+)$') AS match
          FROM ${q}.contracts
        ) numbered
        WHERE match IS NOT NULL
      `,
    );
    const maxNumber = Number(maxRows[0]?.max_number ?? 0);

    if (maxNumber > 0) {
      await this.dataSource.query(
        `SELECT setval($1::regclass, $2::bigint, true)`,
        [`${schemaName}.contract_number_seq`, maxNumber],
      );
    }
  }

  async ensureUnitId(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      ALTER TABLE ${q}.contracts
        ADD COLUMN IF NOT EXISTS unit_id INTEGER
          REFERENCES ${q}.units(id) ON DELETE SET NULL;
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_contracts_unit_id
      ON ${q}.contracts(unit_id);
    `);
  }

  async ensureContractTemplates(schemaName: string): Promise<void> {
    const q = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${q}.contract_templates (
        id           SERIAL PRIMARY KEY,
        language     VARCHAR(5)   NOT NULL,
        name         VARCHAR(200) NOT NULL,
        content      TEXT         NOT NULL,
        is_active    BOOLEAN      NOT NULL DEFAULT TRUE,
        created_at   TIMESTAMP    NOT NULL DEFAULT NOW(),
        updated_at   TIMESTAMP    NOT NULL DEFAULT NOW()
      );
    `);

    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS idx_contract_templates_language
        ON ${q}.contract_templates(language);
    `);

    const existingRows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(*) AS count FROM ${q}.contract_templates`,
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
      `INSERT INTO ${q}.contract_templates
         (language, name, content, is_active)
       VALUES
         ('es', 'Contrato de Arrendamiento Estándar (ES)', $1, true),
         ('en', 'Standard Rental Agreement (EN)', $2, true)`,
      [esContent, enContent],
    );
  }
}
