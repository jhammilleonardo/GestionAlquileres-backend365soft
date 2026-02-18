import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Tenant } from './metadata/tenant.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private tenantRepository: Repository<Tenant>,
    private dataSource: DataSource,
  ) {}

  async create(createTenantDto: CreateTenantDto) {
    // Verificar si ya existe el slug
    const existingSlug = await this.tenantRepository.findOne({
      where: { slug: createTenantDto.slug },
    });

    if (existingSlug) {
      throw new BadRequestException(
        `Tenant with slug '${createTenantDto.slug}' already exists`,
      );
    }

    // Generar schema_name a partir del slug
    const schema_name = `tenant_${createTenantDto.slug.replace(/-/g, '_')}`;

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
    });

    const savedTenant = await this.tenantRepository.save(tenant);

    // Crear el schema en PostgreSQL
    await this.createTenantSchema(savedTenant);

    return savedTenant;
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

  async update(id: number, updateTenantDto: UpdateTenantDto) {
    await this.findOne(id); // Verify exists

    // Si se cambia el slug, actualizar también el schema_name
    const updateData: Partial<Tenant> = { ...updateTenantDto };

    if (updateTenantDto.slug) {
      updateData.schema_name = `tenant_${updateTenantDto.slug.replace(/-/g, '_')}`;
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

  private async createTenantSchema(tenant: Tenant) {
    try {
      // 1. Crear el schema en PostgreSQL
      await this.dataSource.query(
        `CREATE SCHEMA IF NOT EXISTS ${tenant.schema_name}`,
      );

      // 2. Crear ENUMs necesarios
      // ENUM de user_role
      await this.dataSource.query(`
        DO $$ BEGIN
          CREATE TYPE ${tenant.schema_name}.user_role_enum AS ENUM ('ADMIN', 'INQUILINO');
        EXCEPTION
          WHEN duplicate_object THEN null;
        END $$;
      `);

      // 3. Crear la tabla user
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS ${tenant.schema_name}."user" (
          id SERIAL PRIMARY KEY,
          email character varying NOT NULL UNIQUE,
          password character varying NOT NULL,
          name character varying NOT NULL,
          phone character varying,
          role ${tenant.schema_name}.user_role_enum NOT NULL DEFAULT 'INQUILINO',
          is_active boolean NOT NULL DEFAULT true,
          created_at TIMESTAMP NOT NULL DEFAULT now(),
          updated_at TIMESTAMP NOT NULL DEFAULT now()
        );
      `);

      // 4. Crear índices en user
      await this.dataSource.query(`
        CREATE INDEX IF NOT EXISTS IDX_USER_EMAIL ON ${tenant.schema_name}."user"(email);
      `);

      // 5. Crear tablas de Properties
      await this.createPropertiesTables(tenant.schema_name);

      // 6. Crear tablas de Contracts
      await this.createContractsTables(tenant.schema_name);

      // 7. Crear tablas de Maintenance
      await this.createMaintenanceTables(tenant.schema_name);

      // 8. Crear tablas de Notifications
      await this.createNotificationsTables(tenant.schema_name);

      // 9. Crear tablas de Payments
      await this.createPaymentsTables(tenant.schema_name);

      // 10. Insertar datos iniciales (seed data)
      await this.seedPropertyTypesAndSubtypes(tenant.schema_name);

      // 11. Otorgar permisos al usuario de la aplicación
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
      `GRANT USAGE ON SCHEMA ${schemaName} TO ${dbUser}`,
    );

    // Otorgar todos los privilegios sobre todas las tablas existentes
    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA ${schemaName} TO ${dbUser}`,
    );

    // Otorgar todos los privilegios sobre todas las secuencias existentes
    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA ${schemaName} TO ${dbUser}`,
    );

    // Otorgar todos los privilegios sobre todos los tipos (ENUMs)
    await this.dataSource.query(
      `GRANT ALL PRIVILEGES ON ALL TYPES IN SCHEMA ${schemaName} TO ${dbUser}`,
    );

    // Configurar permisos por defecto para futuras tablas
    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON TABLES TO ${dbUser}`,
    );

    // Configurar permisos por defecto para futuras secuencias
    await this.dataSource.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA ${schemaName} GRANT ALL ON SEQUENCES TO ${dbUser}`,
    );
  }

  private async createPropertiesTables(schemaName: string) {
    // Tabla: property_types
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.property_types (
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
      CREATE TABLE IF NOT EXISTS ${schemaName}.property_subtypes (
        id SERIAL PRIMARY KEY,
        property_type_id integer NOT NULL,
        name character varying NOT NULL,
        code character varying NOT NULL UNIQUE,
        is_active boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_subtypes_type FOREIGN KEY (property_type_id)
          REFERENCES ${schemaName}.property_types(id)
      );
    `);

    // Tabla: rental_owners
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.rental_owners (
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
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now()
      );
    `);

    // Tabla: properties
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.properties (
        id SERIAL PRIMARY KEY,
        title character varying NOT NULL,
        description character varying,
        property_type_id integer NOT NULL,
        property_subtype_id integer NOT NULL,
        status character varying NOT NULL DEFAULT 'DISPONIBLE',
        latitude decimal(10,8),
        longitude decimal(11,8),
        images text[] DEFAULT '{}',
        security_deposit_amount decimal(10,2),
        amenities json DEFAULT '[]',
        included_items json DEFAULT '[]',
        account_number character varying,
        account_type character varying,
        account_holder_name character varying,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_properties_type FOREIGN KEY (property_type_id)
          REFERENCES ${schemaName}.property_types(id),
        CONSTRAINT fk_properties_subtype FOREIGN KEY (property_subtype_id)
          REFERENCES ${schemaName}.property_subtypes(id),
        CONSTRAINT chk_properties_status
          CHECK (status IN ('DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'))
      );
    `);

    // Tabla: property_addresses
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.property_addresses (
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
          REFERENCES ${schemaName}.properties(id) ON DELETE CASCADE,
        CONSTRAINT chk_property_addresses_type
          CHECK (address_type IN ('address_1', 'address_2', 'address_3'))
      );
    `);

    // Tabla: property_owners
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.property_owners (
        id SERIAL PRIMARY KEY,
        property_id integer NOT NULL,
        rental_owner_id integer NOT NULL,
        ownership_percentage integer NOT NULL DEFAULT 0,
        is_primary boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_property_owners_property FOREIGN KEY (property_id)
          REFERENCES ${schemaName}.properties(id) ON DELETE CASCADE,
        CONSTRAINT fk_property_owners_owner FOREIGN KEY (rental_owner_id)
          REFERENCES ${schemaName}.rental_owners(id),
        CONSTRAINT chk_ownership_percentage
          CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100)
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_TYPE ON ${schemaName}.properties(property_type_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_SUBTYPE ON ${schemaName}.properties(property_subtype_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTIES_STATUS ON ${schemaName}.properties(status);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_ADDRESSES_PROPERTY ON ${schemaName}.property_addresses(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_PROPERTY ON ${schemaName}.property_owners(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PROPERTY_OWNERS_OWNER ON ${schemaName}.property_owners(rental_owner_id);
    `);
  }

  private async createContractsTables(schemaName: string) {
    // ENUM de contract_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.contract_status_enum AS ENUM (
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
      CREATE TABLE IF NOT EXISTS ${schemaName}.contracts (
        id SERIAL PRIMARY KEY,
        contract_number character varying NOT NULL UNIQUE,
        tenant_id integer NOT NULL,
        property_id integer NOT NULL,
        status ${schemaName}.contract_status_enum NOT NULL DEFAULT 'BORRADOR',
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
        termination_reason text,
        applied_penalty decimal(10,2),
        returned_deposit decimal(10,2),
        terminated_by character varying,
        created_at timestamp with time zone DEFAULT now(),
        updated_at timestamp with time zone DEFAULT now(),
        CONSTRAINT fk_contracts_property FOREIGN KEY (property_id)
          REFERENCES ${schemaName}.properties(id),
        CONSTRAINT fk_contracts_tenant FOREIGN KEY (tenant_id)
          REFERENCES ${schemaName}."user"(id)
      );
    `);

    // Tabla: contract_history
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.contract_history (
        id SERIAL PRIMARY KEY,
        contract_id integer NOT NULL,
        field_modified character varying NOT NULL,
        old_value text,
        new_value text,
        modified_by integer NOT NULL,
        reason text,
        change_date timestamp with time zone DEFAULT now(),
        CONSTRAINT fk_history_contract FOREIGN KEY (contract_id)
          REFERENCES ${schemaName}.contracts(id) ON DELETE CASCADE
      );
    `);

    // Índices para contratos
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_TENANT ON ${schemaName}.contracts(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_PROPERTY ON ${schemaName}.contracts(property_id);
      CREATE INDEX IF NOT EXISTS IDX_CONTRACTS_STATUS ON ${schemaName}.contracts(status);
      CREATE INDEX IF NOT EXISTS IDX_HISTORY_CONTRACT ON ${schemaName}.contract_history(contract_id);
    `);
  }

  private async seedPropertyTypesAndSubtypes(schemaName: string) {
    // Insertar Property Types
    await this.dataSource.query(`
      INSERT INTO ${schemaName}.property_types (name, code, is_active, created_at, updated_at)
      VALUES
        ('Residencial', 'RESIDENTIAL', true, NOW(), NOW()),
        ('Comercial', 'COMMERCIAL', true, NOW(), NOW())
      ON CONFLICT (code) DO NOTHING;
    `);

    // Obtener los IDs de los tipos insertados
    const types: { id: number; code: string }[] = await this.dataSource.query(`
      SELECT id, code FROM ${schemaName}.property_types WHERE code IN ('RESIDENTIAL', 'COMMERCIAL')
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
      INSERT INTO ${schemaName}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
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
      INSERT INTO ${schemaName}.property_subtypes (property_type_id, name, code, is_active, created_at, updated_at)
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
        CREATE TYPE ${schemaName}.maintenance_request_type_enum AS ENUM ('MAINTENANCE', 'GENERAL');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_category
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.maintenance_category_enum AS ENUM ('GENERAL', 'ACCESORIOS', 'ELECTRICO', 'CLIMATIZACION', 'LLAVE_CERRADURA', 'ILUMINACION', 'AFUERA', 'PLOMERIA');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de permission_to_enter
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.permission_to_enter_enum AS ENUM ('YES', 'NO', 'NOT_APPLICABLE');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_status
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.maintenance_status_enum AS ENUM ('NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // ENUM de maintenance_priority
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.maintenance_priority_enum AS ENUM ('LOW', 'NORMAL', 'HIGH');
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: maintenance_requests
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.maintenance_requests (
        id SERIAL PRIMARY KEY,
        ticket_number character varying NOT NULL UNIQUE,
        request_type ${schemaName}.maintenance_request_type_enum NOT NULL DEFAULT 'MAINTENANCE',
        category ${schemaName}.maintenance_category_enum,
        title character varying NOT NULL,
        description text NOT NULL,
        permission_to_enter ${schemaName}.permission_to_enter_enum NOT NULL DEFAULT 'NOT_APPLICABLE',
        has_pets boolean NOT NULL DEFAULT false,
        entry_notes text,
        status ${schemaName}.maintenance_status_enum NOT NULL DEFAULT 'NEW',
        priority ${schemaName}.maintenance_priority_enum NOT NULL DEFAULT 'NORMAL',
        due_date date,
        assigned_to integer,
        tenant_id integer NOT NULL,
        contract_id integer NOT NULL,
        property_id integer NOT NULL,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        updated_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_requests_contract FOREIGN KEY (contract_id)
          REFERENCES ${schemaName}.contracts(id),
        CONSTRAINT fk_maintenance_requests_property FOREIGN KEY (property_id)
          REFERENCES ${schemaName}.properties(id)
      );
    `);

    // Tabla: maintenance_messages
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.maintenance_messages (
        id SERIAL PRIMARY KEY,
        maintenance_request_id integer NOT NULL,
        user_id integer NOT NULL,
        message text NOT NULL,
        send_to_resident boolean NOT NULL DEFAULT true,
        created_at TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT fk_maintenance_messages_request FOREIGN KEY (maintenance_request_id)
          REFERENCES ${schemaName}.maintenance_requests(id) ON DELETE CASCADE
      );
    `);

    // Tabla: maintenance_attachments
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.maintenance_attachments (
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
          REFERENCES ${schemaName}.maintenance_requests(id) ON DELETE CASCADE,
        CONSTRAINT fk_maintenance_attachments_message FOREIGN KEY (message_id)
          REFERENCES ${schemaName}.maintenance_messages(id) ON DELETE CASCADE
      );
    `);

    // Crear índices para optimizar consultas
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TENANT ON ${schemaName}.maintenance_requests(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_CONTRACT ON ${schemaName}.maintenance_requests(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PROPERTY ON ${schemaName}.maintenance_requests(property_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_STATUS ON ${schemaName}.maintenance_requests(status);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_PRIORITY ON ${schemaName}.maintenance_requests(priority);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_REQUESTS_TYPE ON ${schemaName}.maintenance_requests(request_type);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_MESSAGES_REQUEST ON ${schemaName}.maintenance_messages(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_REQUEST ON ${schemaName}.maintenance_attachments(maintenance_request_id);
      CREATE INDEX IF NOT EXISTS IDX_MAINTENANCE_ATTACHMENTS_MESSAGE ON ${schemaName}.maintenance_attachments(message_id);
    `);
  }

  private async createNotificationsTables(schemaName: string) {
    // ENUM de notification_event_type
    await this.dataSource.query(`
      DO $$ BEGIN
        CREATE TYPE ${schemaName}.notification_event_type_enum AS ENUM (
          'maintenance.request.created',
          'maintenance.status.changed',
          'maintenance.message.received',
          'maintenance.assigned',
          'maintenance.completed',
          'property.status.changed',
          'property.available',
          'user.registered',
          'user.password.changed'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Tabla: notifications
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.notifications (
        id SERIAL PRIMARY KEY,
        user_id integer NOT NULL,
        event_type ${schemaName}.notification_event_type_enum NOT NULL,
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
      CREATE TABLE IF NOT EXISTS ${schemaName}.notification_templates (
        id SERIAL PRIMARY KEY,
        event_type ${schemaName}.notification_event_type_enum NOT NULL UNIQUE,
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
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_USER_ID ON ${schemaName}.notifications(user_id);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_EVENT_TYPE ON ${schemaName}.notifications(event_type);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_IS_READ ON ${schemaName}.notifications(is_read);
      CREATE INDEX IF NOT EXISTS IDX_NOTIFICATIONS_CREATED_AT ON ${schemaName}.notifications(created_at DESC);
    `);
  }

  private async createPaymentsTables(schemaName: string) {
    // Tabla: payments
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.payments (
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
        parent_payment_id INTEGER REFERENCES ${schemaName}.payments(id) ON DELETE SET NULL,
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
          REFERENCES ${schemaName}.contracts(id),
        CONSTRAINT fk_payments_property FOREIGN KEY (property_id)
          REFERENCES ${schemaName}.properties(id)
      );
    `);

    // Tabla: payment_schedules
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.payment_schedules (
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
          REFERENCES ${schemaName}.contracts(id),
        CONSTRAINT fk_payment_schedules_property FOREIGN KEY (property_id)
          REFERENCES ${schemaName}.properties(id)
      );
    `);

    // Tabla: payment_refunds
    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.payment_refunds (
        id SERIAL PRIMARY KEY,
        payment_id INTEGER NOT NULL REFERENCES ${schemaName}.payments(id) ON DELETE CASCADE,
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
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TENANT ON ${schemaName}.payments(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CONTRACT ON ${schemaName}.payments(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_PROPERTY ON ${schemaName}.payments(property_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_STATUS ON ${schemaName}.payments(status);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_DATE ON ${schemaName}.payments(payment_date);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_CREATED_AT ON ${schemaName}.payments(created_at);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_TYPE ON ${schemaName}.payments(payment_type);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENTS_METHOD ON ${schemaName}.payments(payment_method);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_TENANT ON ${schemaName}.payment_schedules(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_CONTRACT ON ${schemaName}.payment_schedules(contract_id);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_SCHEDULES_ACTIVE ON ${schemaName}.payment_schedules(is_active);
      CREATE INDEX IF NOT EXISTS IDX_PAYMENT_REFUNDS_PAYMENT ON ${schemaName}.payment_refunds(payment_id);
    `);

    // Crear trigger para updated_at (si no existe)
    await this.dataSource.query(`
      CREATE OR REPLACE FUNCTION ${schemaName}.update_updated_at_column()
      RETURNS TRIGGER AS $$
      BEGIN
          NEW.updated_at = CURRENT_TIMESTAMP;
          RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payments_updated_at ON ${schemaName}.payments;
      CREATE TRIGGER update_payments_updated_at
          BEFORE UPDATE ON ${schemaName}.payments
          FOR EACH ROW
          EXECUTE FUNCTION ${schemaName}.update_updated_at_column();
    `);

    await this.dataSource.query(`
      DROP TRIGGER IF EXISTS update_payment_schedules_updated_at ON ${schemaName}.payment_schedules;
      CREATE TRIGGER update_payment_schedules_updated_at
          BEFORE UPDATE ON ${schemaName}.payment_schedules
          FOR EACH ROW
          EXECUTE FUNCTION ${schemaName}.update_updated_at_column();
    `);
  }

  private async dropTenantSchema(tenant: Tenant) {
    try {
      // Eliminar el schema de PostgreSQL (CASCADE elimina todas las tablas)
      await this.dataSource.query(
        `DROP SCHEMA IF EXISTS ${tenant.schema_name} CASCADE`,
      );
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      throw new BadRequestException(`Failed to drop schema: ${message}`);
    }
  }
}
