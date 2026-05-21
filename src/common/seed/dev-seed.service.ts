import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { AuthService } from '../../auth/auth.service';
import { TenantCountry } from '../../tenants/dto/create-tenant.dto';
import { quoteIdent } from '../utils/sql-identifier';

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Seed automático del entorno de desarrollo.
 *
 * Solo se ejecuta cuando NODE_ENV = 'development'.
 * Es completamente idempotente: si el tenant demo ya existe, no hace nada.
 *
 * Credenciales del admin:    admin@365soft.com / Admin365!
 * Credenciales empleado:     empleado@365soft.com / Empleado365!
 * Credenciales técnico:      tecnico@365soft.com / Tecnico365!
 * Credenciales inquilino 1:  maria.perez@gmail.com / Inquilino365!
 * Credenciales inquilino 2:  carlos.mamani@gmail.com / Inquilino365!
 * Credenciales inquilino 3:  ana.flores@gmail.com / Inquilino365!
 * URL base:  http://localhost:3000/demo/admin/...
 */
@Injectable()
export class DevSeedService implements OnModuleInit {
  private readonly logger = new Logger(DevSeedService.name);

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly authService: AuthService,
  ) {}

  async onModuleInit() {
    if (process.env.NODE_ENV !== 'development') return;

    try {
      await this.seedDevTenant();
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : String(error);
      this.logger.error(`Dev seed falló: ${msg}`);
    }
  }

  private async seedDevTenant() {
    const existing: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM public.tenant WHERE slug = 'demo' LIMIT 1`,
    );

    if (existing.length > 0) {
      this.logger.log('Dev seed: tenant "demo" ya existe, nada que hacer.');
      return;
    }

    const seedEmail = process.env.DEV_SEED_EMAIL ?? 'admin@365soft.com';
    const seedPassword = process.env.DEV_SEED_PASSWORD ?? 'Admin365!';

    this.logger.log(
      'Dev seed: creando tenant "demo" con datos de demostración...',
    );

    await this.authService.registerAdmin({
      slug: 'demo',
      company_name: '365Soft Demo',
      country: TenantCountry.BO,
      name: 'Admin Demo',
      email: seedEmail,
      password: seedPassword,
      currency: 'BOB',
      locale: 'es-BO',
    });

    const schema = 'tenant_demo';

    await this.seedUsers(schema);
    await this.seedRentalOwners(schema);
    await this.seedProperties(schema);
    await this.seedContracts(schema);
    await this.seedPayments(schema);
    await this.seedMaintenanceRequests(schema);
    await this.seedApplications(schema);

    this.logger.log(
      '✔ Dev seed completado con datos de demostración completos.',
    );
    this.logger.log('  → Slug:          demo');
    this.logger.log(
      `  → Admin:         ${seedEmail} / (ver DEV_SEED_PASSWORD)`,
    );
    this.logger.log('  → Empleado:      empleado@365soft.com / Empleado365!');
    this.logger.log('  → Técnico:       tecnico@365soft.com / Tecnico365!');
    this.logger.log('  → Inquilino 1:   maria.perez@gmail.com / Inquilino365!');
    this.logger.log(
      '  → Inquilino 2:   carlos.mamani@gmail.com / Inquilino365!',
    );
    this.logger.log('  → Inquilino 3:   ana.flores@gmail.com / Inquilino365!');
  }

  // ─── USUARIOS ─────────────────────────────────────────────────────────────

  private async seedUsers(schema: string) {
    const hash = (pwd: string) => bcrypt.hash(pwd, BCRYPT_SALT_ROUNDS);

    const users = [
      {
        email: 'empleado@365soft.com',
        password: await hash('Empleado365!'),
        name: 'Laura Gutiérrez',
        phone: '70011111',
        role: 'EMPLEADO',
      },
      {
        email: 'tecnico@365soft.com',
        password: await hash('Tecnico365!'),
        name: 'Roberto Condori',
        phone: '70022222',
        role: 'TECNICO',
      },
      {
        email: 'maria.perez@gmail.com',
        password: await hash('Inquilino365!'),
        name: 'María Pérez López',
        phone: '70033333',
        role: 'INQUILINO',
      },
      {
        email: 'carlos.mamani@gmail.com',
        password: await hash('Inquilino365!'),
        name: 'Carlos Mamani Quispe',
        phone: '70044444',
        role: 'INQUILINO',
      },
      {
        email: 'ana.flores@gmail.com',
        password: await hash('Inquilino365!'),
        name: 'Ana Flores Vargas',
        phone: '70055555',
        role: 'INQUILINO',
      },
    ];

    for (const u of users) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}."user"
           (email, password, name, phone, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
         ON CONFLICT (email) DO NOTHING`,
        [u.email, u.password, u.name, u.phone, u.role],
      );
    }

    // Permisos del empleado
    const empleado: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${quoteIdent(schema)}."user" WHERE email = 'empleado@365soft.com' LIMIT 1`,
    );

    if (empleado.length > 0) {
      const modules = [
        {
          module: 'properties',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false,
        },
        {
          module: 'contracts',
          can_view: true,
          can_create: false,
          can_edit: false,
          can_delete: false,
        },
        {
          module: 'payments',
          can_view: true,
          can_create: true,
          can_edit: false,
          can_delete: false,
        },
        {
          module: 'maintenance',
          can_view: true,
          can_create: true,
          can_edit: true,
          can_delete: false,
        },
        {
          module: 'reports',
          can_view: true,
          can_create: false,
          can_edit: false,
          can_delete: false,
        },
      ];

      for (const perm of modules) {
        await this.dataSource.query(
          `INSERT INTO ${quoteIdent(schema)}.employee_permissions
             (user_id, module, can_view, can_create, can_edit, can_delete, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
           ON CONFLICT (user_id, module) DO NOTHING`,
          [
            empleado[0].id,
            perm.module,
            perm.can_view,
            perm.can_create,
            perm.can_edit,
            perm.can_delete,
          ],
        );
      }
    }

    this.logger.log('  ✔ Usuarios semilla creados');
  }

  // ─── PROPIETARIOS ──────────────────────────────────────────────────────────

  private async seedRentalOwners(schema: string) {
    const owners = [
      {
        name: 'Jorge Villanueva',
        company_name: null,
        is_company: false,
        primary_email: 'jorge.villanueva@gmail.com',
        phone_number: '76600001',
        notes: 'Propietario principal — pago el día 10 de cada mes',
        bank_name: 'Banco Unión',
        account_number: '1000234567',
        account_type: 'AHORRO',
        account_holder_name: 'Jorge Villanueva Romero',
        cbu_iban: null,
      },
      {
        name: 'Inversiones Altiplano S.R.L.',
        company_name: 'Inversiones Altiplano S.R.L.',
        is_company: true,
        primary_email: 'contacto@altiplano.bo',
        phone_number: '22345678',
        notes: 'Empresa propietaria de 3 inmuebles comerciales',
        bank_name: 'BNB',
        account_number: '2000567890',
        account_type: 'CORRIENTE',
        account_holder_name: 'Inversiones Altiplano SRL',
        cbu_iban: null,
      },
    ];

    for (const o of owners) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.rental_owners
           (name, company_name, is_company, primary_email, phone_number, notes,
            is_active, bank_name, account_number, account_type, account_holder_name, cbu_iban,
            created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,true,$7,$8,$9,$10,$11,NOW(),NOW())`,
        [
          o.name,
          o.company_name,
          o.is_company,
          o.primary_email,
          o.phone_number,
          o.notes,
          o.bank_name,
          o.account_number,
          o.account_type,
          o.account_holder_name,
          o.cbu_iban,
        ],
      );
    }

    this.logger.log('  ✔ Propietarios semilla creados');
  }

  // ─── PROPIEDADES ───────────────────────────────────────────────────────────

  private async seedProperties(schema: string) {
    const types: { id: number; code: string }[] = await this.dataSource.query(
      `SELECT id, code FROM ${quoteIdent(schema)}.property_types WHERE code IN ('RESIDENTIAL','COMMERCIAL')`,
    );
    const residential = types.find((t) => t.code === 'RESIDENTIAL');
    const commercial = types.find((t) => t.code === 'COMMERCIAL');

    if (!residential || !commercial) {
      this.logger.warn(
        'Dev seed: property_types no encontrados, omitiendo propiedades.',
      );
      return;
    }

    const subtypes: { id: number; code: string }[] =
      await this.dataSource.query(
        `SELECT id, code FROM ${quoteIdent(schema)}.property_subtypes`,
      );
    const sub = (code: string) =>
      subtypes.find((s) => s.code === code)?.id ?? 1;

    const owners: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${quoteIdent(schema)}.rental_owners ORDER BY id`,
    );
    const ownerId1 = owners[0]?.id;
    const ownerId2 = owners[1]?.id;

    const amenitiesResidencial = JSON.stringify([
      'Agua caliente',
      'Gas natural',
      'Parqueo',
      'Seguridad 24h',
      'Áreas verdes',
    ]);
    const amenitiesComercial = JSON.stringify([
      'Estacionamiento',
      'Acceso discapacitados',
      'Aire acondicionado',
      'Generador',
    ]);

    const properties = [
      {
        title: 'Departamento Moderno Zona Sur',
        description:
          'Amplio departamento de 2 dormitorios con vista panorámica en Calacoto. Totalmente amoblado, cocina equipada y balcón.',
        type_id: residential.id,
        subtype_id: sub('CONDO_TOWNHOME'),
        status: 'OCUPADO',
        monthly_rent: 4500.0,
        square_meters: 85,
        bedrooms: 2,
        bathrooms: 2,
        parking_spaces: 1,
        year_built: 2018,
        is_furnished: true,
        amenities: amenitiesResidencial,
        security_deposit: 9000.0,
        rental_type: 'LONG_TERM',
        address: {
          street: 'Av. Ballivián #1234, Piso 7',
          city: 'La Paz',
          state: 'La Paz',
          zip: '0000',
          country: 'BO',
        },
        owner_idx: 0,
      },
      {
        title: 'Casa Unifamiliar Achumani',
        description:
          'Casa de 3 dormitorios con jardín en Achumani. Cocina americana, sala-comedor integrados y garage para 2 vehículos.',
        type_id: residential.id,
        subtype_id: sub('SINGLE_FAMILY'),
        status: 'OCUPADO',
        monthly_rent: 7200.0,
        square_meters: 180,
        bedrooms: 3,
        bathrooms: 3,
        parking_spaces: 2,
        year_built: 2015,
        is_furnished: false,
        amenities: JSON.stringify([
          'Jardín',
          'Garage',
          'Cuarto de servicio',
          'Terraza',
        ]),
        security_deposit: 14400.0,
        rental_type: 'LONG_TERM',
        address: {
          street: 'Calle 15 de Achumani #567',
          city: 'La Paz',
          state: 'La Paz',
          zip: '0000',
          country: 'BO',
        },
        owner_idx: 0,
      },
      {
        title: 'Oficina Ejecutiva Sopocachi',
        description:
          'Oficina de 60m² en pleno centro de Sopocachi. Incluye sala de reuniones compartida y recepción.',
        type_id: commercial.id,
        subtype_id: sub('OFFICE'),
        status: 'DISPONIBLE',
        monthly_rent: 3800.0,
        square_meters: 60,
        bedrooms: 0,
        bathrooms: 1,
        parking_spaces: 1,
        year_built: 2020,
        is_furnished: true,
        amenities: amenitiesComercial,
        security_deposit: 7600.0,
        rental_type: 'LONG_TERM',
        address: {
          street: 'Av. 6 de Agosto #2100, Piso 4',
          city: 'La Paz',
          state: 'La Paz',
          zip: '0000',
          country: 'BO',
        },
        owner_idx: 1,
      },
      {
        title: 'Departamento Estudio Centro',
        description:
          'Estudio compacto ideal para estudiantes o profesionales. Amoblado, internet incluido, edificio con vigilancia.',
        type_id: residential.id,
        subtype_id: sub('CONDO_TOWNHOME'),
        status: 'DISPONIBLE',
        monthly_rent: 2200.0,
        square_meters: 38,
        bedrooms: 1,
        bathrooms: 1,
        parking_spaces: 0,
        year_built: 2019,
        is_furnished: true,
        amenities: JSON.stringify([
          'Internet',
          'Seguridad',
          'Lavandería común',
        ]),
        security_deposit: 4400.0,
        rental_type: 'BOTH',
        address: {
          street: 'Calle Comercio #890, Piso 3',
          city: 'La Paz',
          state: 'La Paz',
          zip: '0000',
          country: 'BO',
        },
        owner_idx: 0,
      },
      {
        title: 'Local Comercial Miraflores',
        description:
          'Local de 90m² en avenida de alto tráfico. Ideal para retail, farmacia o restaurante. Entrega inmediata.',
        type_id: commercial.id,
        subtype_id: sub('RENTAL'),
        status: 'MANTENIMIENTO',
        monthly_rent: 5500.0,
        square_meters: 90,
        bedrooms: 0,
        bathrooms: 2,
        parking_spaces: 0,
        year_built: 2010,
        is_furnished: false,
        amenities: JSON.stringify([
          'Acceso discapacitados',
          'Vitrina frontal',
          'Bodega trasera',
        ]),
        security_deposit: 11000.0,
        rental_type: 'LONG_TERM',
        address: {
          street: 'Av. Saavedra #3400, Local 5',
          city: 'La Paz',
          state: 'La Paz',
          zip: '0000',
          country: 'BO',
        },
        owner_idx: 1,
      },
    ];

    for (let i = 0; i < properties.length; i++) {
      const p = properties[i];

      const inserted: { id: number }[] = await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.properties
           (title, description, property_type_id, property_subtype_id, status,
            monthly_rent, currency, square_meters, bedrooms, bathrooms, parking_spaces,
            year_built, is_furnished, amenities, security_deposit_amount, rental_type,
            images, included_items, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'BOB',$7,$8,$9,$10,$11,$12,$13,$14,$15,'[]','[]',NOW(),NOW())
         RETURNING id`,
        [
          p.title,
          p.description,
          p.type_id,
          p.subtype_id,
          p.status,
          p.monthly_rent,
          p.square_meters,
          p.bedrooms,
          p.bathrooms,
          p.parking_spaces,
          p.year_built,
          p.is_furnished,
          p.amenities,
          p.security_deposit,
          p.rental_type,
        ],
      );

      const propertyId = inserted[0].id;

      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.property_addresses
           (property_id, address_type, street_address, city, state, zip_code, country, created_at)
         VALUES ($1,'address_1',$2,$3,$4,$5,$6,NOW())`,
        [
          propertyId,
          p.address.street,
          p.address.city,
          p.address.state,
          p.address.zip,
          p.address.country,
        ],
      );

      const ownerId = p.owner_idx === 0 ? ownerId1 : ownerId2;
      if (ownerId) {
        await this.dataSource.query(
          `INSERT INTO ${quoteIdent(schema)}.property_owners
             (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
           VALUES ($1,$2,100,true,NOW())`,
          [propertyId, ownerId],
        );
      }
    }

    this.logger.log('  ✔ Propiedades semilla creadas (5 propiedades)');
  }

  // ─── CONTRATOS ─────────────────────────────────────────────────────────────

  private async seedContracts(schema: string) {
    const users: { id: number; email: string }[] = await this.dataSource.query(
      `SELECT id, email FROM ${quoteIdent(schema)}."user" WHERE role = 'INQUILINO' ORDER BY id`,
    );
    const properties: { id: number; title: string }[] =
      await this.dataSource.query(
        `SELECT id, title FROM ${quoteIdent(schema)}.properties ORDER BY id`,
      );

    if (users.length < 2 || properties.length < 2) {
      this.logger.warn(
        'Dev seed: usuarios o propiedades insuficientes para contratos.',
      );
      return;
    }

    const contracts = [
      {
        contract_number: 'CTR-2024-001',
        tenant_id: users[0].id,
        property_id: properties[0].id,
        status: 'ACTIVO',
        start_date: '2024-01-01',
        end_date: '2025-01-01',
        duration_months: 12,
        monthly_rent: 4500.0,
        deposit_amount: 9000.0,
        payment_day: 5,
        late_fee_percentage: 2.0,
        grace_days: 5,
        payment_method: 'transferencia',
        currency: 'BOB',
        auto_renew: true,
        jurisdiction: 'La Paz, Bolivia',
        included_services: JSON.stringify(['Agua', 'Gas']),
        tenant_responsibilities:
          'Mantenimiento de equipos, limpieza de áreas comunes.',
        owner_responsibilities:
          'Reparaciones estructurales, pintura cada 2 años.',
      },
      {
        contract_number: 'CTR-2024-002',
        tenant_id: users[1].id,
        property_id: properties[1].id,
        status: 'ACTIVO',
        start_date: '2024-03-15',
        end_date: '2025-03-15',
        duration_months: 12,
        monthly_rent: 7200.0,
        deposit_amount: 14400.0,
        payment_day: 10,
        late_fee_percentage: 2.0,
        grace_days: 5,
        payment_method: 'qr_accl',
        currency: 'BOB',
        auto_renew: false,
        jurisdiction: 'La Paz, Bolivia',
        included_services: JSON.stringify([]),
        tenant_responsibilities: 'Jardín, limpieza exterior.',
        owner_responsibilities: 'Mantenimiento estructura y techos.',
      },
      {
        contract_number: 'CTR-2023-001',
        tenant_id: users[2].id,
        property_id: properties[3].id,
        status: 'VENCIDO',
        start_date: '2023-01-01',
        end_date: '2024-01-01',
        duration_months: 12,
        monthly_rent: 2200.0,
        deposit_amount: 4400.0,
        payment_day: 1,
        late_fee_percentage: 2.0,
        grace_days: 3,
        payment_method: 'transferencia',
        currency: 'BOB',
        auto_renew: false,
        jurisdiction: 'La Paz, Bolivia',
        included_services: JSON.stringify(['Internet']),
        tenant_responsibilities: 'Limpieza, cuidado de mobiliario.',
        owner_responsibilities: 'Mantenimiento de electrodomésticos.',
      },
    ];

    for (const c of contracts) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.contracts
           (contract_number, tenant_id, property_id, status, start_date, end_date,
            duration_months, monthly_rent, currency, deposit_amount, payment_day,
            late_fee_percentage, grace_days, payment_method, auto_renew, jurisdiction,
            included_services, tenant_responsibilities, owner_responsibilities,
            is_signed, created_at, updated_at)
         VALUES ($1,$2,$3,$4::${quoteIdent(schema)}.contract_status_enum,
                 $5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,true,NOW(),NOW())
         ON CONFLICT (contract_number) DO NOTHING`,
        [
          c.contract_number,
          c.tenant_id,
          c.property_id,
          c.status,
          c.start_date,
          c.end_date,
          c.duration_months,
          c.monthly_rent,
          c.currency,
          c.deposit_amount,
          c.payment_day,
          c.late_fee_percentage,
          c.grace_days,
          c.payment_method,
          c.auto_renew,
          c.jurisdiction,
          c.included_services,
          c.tenant_responsibilities,
          c.owner_responsibilities,
        ],
      );
    }

    this.logger.log('  ✔ Contratos semilla creados (3 contratos)');
  }

  // ─── PAGOS ─────────────────────────────────────────────────────────────────

  private async seedPayments(schema: string) {
    const contracts: {
      id: number;
      tenant_id: number;
      property_id: number;
      monthly_rent: number;
    }[] = await this.dataSource.query(
      `SELECT id, tenant_id, property_id, monthly_rent FROM ${quoteIdent(schema)}.contracts ORDER BY id`,
    );

    if (contracts.length === 0) return;

    const admin: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${quoteIdent(schema)}."user" WHERE role = 'ADMIN' LIMIT 1`,
    );
    const adminId = admin[0]?.id ?? null;

    const payments: {
      contract: (typeof contracts)[0];
      amount: number;
      type: string;
      method: string;
      status: string;
      payment_date: string;
      due_date: string;
      reference: string | null;
      notes: string | null;
    }[] = [];

    // Contrato 1 — 4 meses de alquiler pagados + 1 depósito
    if (contracts[0]) {
      const c = contracts[0];
      payments.push(
        {
          contract: c,
          amount: c.monthly_rent * 2,
          type: 'DEPOSIT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-01-01',
          due_date: '2024-01-01',
          reference: 'DEP-001-2024',
          notes: 'Depósito inicial (2 meses)',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-01-05',
          due_date: '2024-01-05',
          reference: 'PAG-ENE-2024',
          notes: 'Alquiler enero 2024',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-02-05',
          due_date: '2024-02-05',
          reference: 'PAG-FEB-2024',
          notes: 'Alquiler febrero 2024',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-03-05',
          due_date: '2024-03-05',
          reference: 'PAG-MAR-2024',
          notes: 'Alquiler marzo 2024',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'qr_accl',
          status: 'APPROVED',
          payment_date: '2024-04-05',
          due_date: '2024-04-05',
          reference: 'PAG-ABR-2024',
          notes: 'Alquiler abril 2024',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'PENDING',
          payment_date: '2024-05-05',
          due_date: '2024-05-05',
          reference: null,
          notes: 'Alquiler mayo 2024 — pendiente aprobación',
        },
      );
    }

    // Contrato 2 — pagos recientes
    if (contracts[1]) {
      const c = contracts[1];
      payments.push(
        {
          contract: c,
          amount: c.monthly_rent * 2,
          type: 'DEPOSIT',
          method: 'qr_accl',
          status: 'APPROVED',
          payment_date: '2024-03-15',
          due_date: '2024-03-15',
          reference: 'DEP-002-2024',
          notes: 'Depósito inicial',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'qr_accl',
          status: 'APPROVED',
          payment_date: '2024-04-10',
          due_date: '2024-04-10',
          reference: 'PAG-ABR-CTR2',
          notes: 'Alquiler abril 2024',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'qr_accl',
          status: 'REJECTED',
          payment_date: '2024-05-12',
          due_date: '2024-05-10',
          reference: null,
          notes: 'Comprobante ilegible — rechazado',
        },
        {
          contract: c,
          amount: 450.0,
          type: 'LATE_FEE',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-05-18',
          due_date: '2024-05-18',
          reference: 'MORA-001',
          notes: 'Mora por atraso de mayo',
        },
      );
    }

    // Contrato 3 (vencido) — historial histórico
    if (contracts[2]) {
      const c = contracts[2];
      payments.push(
        {
          contract: c,
          amount: c.monthly_rent * 2,
          type: 'DEPOSIT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2023-01-01',
          due_date: '2023-01-01',
          reference: 'DEP-003-2023',
          notes: 'Depósito inicial',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2023-01-01',
          due_date: '2023-01-01',
          reference: 'PAG-ENE-2023',
          notes: 'Alquiler enero 2023',
        },
        {
          contract: c,
          amount: c.monthly_rent,
          type: 'RENT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2023-06-01',
          due_date: '2023-06-01',
          reference: 'PAG-JUN-2023',
          notes: 'Alquiler junio 2023',
        },
        {
          contract: c,
          amount: c.monthly_rent * 2,
          type: 'DEPOSIT',
          method: 'transferencia',
          status: 'APPROVED',
          payment_date: '2024-01-10',
          due_date: '2024-01-01',
          reference: 'DEV-DEP-003',
          notes: 'Devolución de depósito al finalizar contrato',
        },
      );
    }

    for (const p of payments) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.payments
           (tenant_id, contract_id, property_id, amount, currency, payment_type, payment_method,
            status, payment_date, due_date, reference_number, notes,
            payment_processor, created_by, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'BOB',$5,$6,$7,$8,$9,$10,$11,'manual',$12,NOW(),NOW())`,
        [
          p.contract.tenant_id,
          p.contract.id,
          p.contract.property_id,
          p.amount,
          p.type,
          p.method,
          p.status,
          p.payment_date,
          p.due_date,
          p.reference,
          p.notes,
          adminId,
        ],
      );
    }

    this.logger.log('  ✔ Pagos semilla creados (14 registros)');
  }

  // ─── MANTENIMIENTO ─────────────────────────────────────────────────────────

  private async seedMaintenanceRequests(schema: string) {
    const users: { id: number; email: string; role: string }[] =
      await this.dataSource.query(
        `SELECT id, email, role FROM ${quoteIdent(schema)}."user" ORDER BY id`,
      );
    const contracts: { id: number; tenant_id: number; property_id: number }[] =
      await this.dataSource.query(
        `SELECT id, tenant_id, property_id FROM ${quoteIdent(schema)}.contracts ORDER BY id`,
      );

    if (contracts.length === 0 || users.length === 0) return;

    const tecnico = users.find((u) => u.role === 'TECNICO');
    const adminUser = users.find((u) => u.role === 'ADMIN');

    const requests = [
      {
        ticket_number: 'MNT-2024-001',
        contract: contracts[0],
        request_type: 'MAINTENANCE',
        category: 'PLOMERIA',
        title: 'Fuga de agua en baño principal',
        description:
          'Hay una fuga de agua debajo del lavamanos del baño principal. El agua gotea constantemente y está dañando el piso.',
        permission_to_enter: 'YES',
        has_pets: false,
        entry_notes: 'Puede ingresar de lunes a viernes de 9 a 18 horas.',
        status: 'COMPLETED',
        priority: 'HIGH',
        assigned_to: tecnico?.id ?? null,
        current_stage: 'COMPLETED',
        completed_at: '2024-03-20T15:00:00Z',
      },
      {
        ticket_number: 'MNT-2024-002',
        contract: contracts[0],
        request_type: 'MAINTENANCE',
        category: 'ELECTRICO',
        title: 'Tomacorriente sin funcionar en sala',
        description:
          'El tomacorriente doble de la pared principal de la sala no tiene electricidad. Probé con varios aparatos.',
        permission_to_enter: 'YES',
        has_pets: false,
        entry_notes: null,
        status: 'IN_PROGRESS',
        priority: 'NORMAL',
        assigned_to: tecnico?.id ?? null,
        current_stage: 'IN_PROGRESS',
        completed_at: null,
      },
      {
        ticket_number: 'MNT-2024-003',
        contract: contracts[1],
        request_type: 'MAINTENANCE',
        category: 'CLIMATIZACION',
        title: 'Aire acondicionado no enfría',
        description:
          'El split del dormitorio principal enciende pero solo expulsa aire caliente. Requiere recarga de gas o revisión técnica.',
        permission_to_enter: 'NOT_APPLICABLE',
        has_pets: true,
        entry_notes: 'Avisar con 24h de anticipación por las mascotas.',
        status: 'NEW',
        priority: 'NORMAL',
        assigned_to: null,
        current_stage: 'NEW',
        completed_at: null,
      },
      {
        ticket_number: 'MNT-2024-004',
        contract: contracts[1],
        request_type: 'GENERAL',
        category: 'GENERAL',
        title: 'Solicitud de llave adicional',
        description:
          'Necesito una copia de la llave del portón principal para mi familiar que vive conmigo.',
        permission_to_enter: 'NOT_APPLICABLE',
        has_pets: false,
        entry_notes: null,
        status: 'CLOSED',
        priority: 'LOW',
        assigned_to: adminUser?.id ?? null,
        current_stage: 'CLOSED',
        completed_at: '2024-04-05T10:00:00Z',
      },
      {
        ticket_number: 'MNT-2024-005',
        contract: contracts[0],
        request_type: 'MAINTENANCE',
        category: 'ILUMINACION',
        title: 'Luces parpadeantes en cocina',
        description:
          'Las luminarias LED de la cocina parpadean intermitentemente, especialmente al encender el horno.',
        permission_to_enter: 'YES',
        has_pets: false,
        entry_notes: 'Preferible los sábados por la mañana.',
        status: 'DEFERRED',
        priority: 'LOW',
        assigned_to: tecnico?.id ?? null,
        current_stage: 'DEFERRED',
        completed_at: null,
      },
    ];

    for (const r of requests) {
      const inserted: { id: number }[] = await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.maintenance_requests
           (ticket_number, request_type, category, title, description,
            permission_to_enter, has_pets, entry_notes, status, priority,
            tenant_id, contract_id, property_id, assigned_to, current_stage,
            completed_at, created_at, updated_at)
         VALUES ($1,
           $2::${quoteIdent(schema)}.maintenance_request_type_enum,
           $3::${quoteIdent(schema)}.maintenance_category_enum,
           $4,$5,
           $6::${quoteIdent(schema)}.permission_to_enter_enum,
           $7,$8,
           $9::${quoteIdent(schema)}.maintenance_status_enum,
           $10::${quoteIdent(schema)}.maintenance_priority_enum,
           $11,$12,$13,$14,$15,$16,NOW(),NOW())
         ON CONFLICT DO NOTHING
         RETURNING id`,
        [
          r.ticket_number,
          r.request_type,
          r.category,
          r.title,
          r.description,
          r.permission_to_enter,
          r.has_pets,
          r.entry_notes,
          r.status,
          r.priority,
          r.contract.tenant_id,
          r.contract.id,
          r.contract.property_id,
          r.assigned_to,
          r.current_stage,
          r.completed_at,
        ],
      );

      if (inserted.length === 0) continue;
      const reqId = inserted[0].id;

      // Mensaje de seguimiento en solicitudes activas
      if (r.status === 'IN_PROGRESS' && tecnico) {
        await this.dataSource.query(
          `INSERT INTO ${quoteIdent(schema)}.maintenance_messages
             (maintenance_request_id, user_id, message, send_to_resident, created_at)
           VALUES ($1,$2,$3,true,NOW())`,
          [
            reqId,
            tecnico.id,
            'He revisado el tomacorriente. Necesito repuesto (breaker 20A). Lo consigo el martes y termino el miércoles.',
          ],
        );
      }

      if (r.status === 'COMPLETED' && adminUser) {
        await this.dataSource.query(
          `INSERT INTO ${quoteIdent(schema)}.maintenance_messages
             (maintenance_request_id, user_id, message, send_to_resident, created_at)
           VALUES ($1,$2,$3,true,NOW())`,
          [
            reqId,
            adminUser.id,
            'Solicitud completada. La fuga fue reparada con éxito. Por favor confirme que todo está en orden.',
          ],
        );
      }
    }

    this.logger.log(
      '  ✔ Solicitudes de mantenimiento semilla creadas (5 solicitudes)',
    );
  }

  // ─── SOLICITUDES DE ALQUILER ───────────────────────────────────────────────

  private async seedApplications(schema: string) {
    const properties: { id: number }[] = await this.dataSource.query(
      `SELECT id FROM ${quoteIdent(schema)}.properties ORDER BY id`,
    );

    if (properties.length < 4) return;

    // Crear usuarios solicitantes (prospectos sin contrato activo)
    const applicantHash = await bcrypt.hash(
      'Inquilino365!',
      BCRYPT_SALT_ROUNDS,
    );
    for (const ap of [
      {
        email: 'diego.torrez@gmail.com',
        name: 'Diego Torrez Salinas',
        phone: '76611223',
      },
      {
        email: 'sofia.rojas@gmail.com',
        name: 'Sofia Rojas Mendoza',
        phone: '70077885',
      },
    ]) {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}."user"
           (email, password, name, phone, role, is_active, created_at, updated_at)
         VALUES ($1,$2,$3,$4,'INQUILINO',true,NOW(),NOW())
         ON CONFLICT (email) DO NOTHING`,
        [ap.email, applicantHash, ap.name, ap.phone],
      );
    }

    const allApplicants: { id: number; email: string }[] =
      await this.dataSource.query(
        `SELECT id, email FROM ${quoteIdent(schema)}."user"
       WHERE email IN ('diego.torrez@gmail.com','sofia.rojas@gmail.com','ana.flores@gmail.com')
       ORDER BY id`,
      );
    const byEmail = (email: string) =>
      allApplicants.find((u) => u.email === email)?.id;

    const applications = [
      {
        property_id: properties[2].id,
        applicant_id: byEmail('diego.torrez@gmail.com'),
        status: 'EN_REVISION',
        personal_data: JSON.stringify({
          full_name: 'Diego Torrez Salinas',
          phone: '76611223',
          identity_document: 'CI: 8765432 LP',
          current_address: 'Av. Arce #2500, La Paz',
          birth_date: '1988-07-15',
        }),
        employment_data: JSON.stringify({
          employer_name: 'Empresa Exportadora Andina S.A.',
          position: 'Gerente Comercial',
          monthly_income: 18000.0,
          employment_duration: '5 años',
          employer_phone: '22456789',
        }),
        rental_history: JSON.stringify([
          {
            previous_landlord_name: 'Hugo Mendoza',
            previous_landlord_phone: '76600123',
            reason_for_leaving:
              'Cambio de trabajo — busco oficina más céntrica',
            previous_rent_amount: 2500,
          },
        ]),
        references: JSON.stringify([
          {
            name: 'Ing. Pedro Alvarado',
            relationship: 'Jefe directo',
            phone: '70099001',
          },
          {
            name: 'Dra. Carla Vidal',
            relationship: 'Colega',
            phone: '70099002',
          },
        ]),
        additional_notes:
          'Necesito la oficina para instalar mi empresa importadora. Pagaré con factura mensualmente.',
        admin_feedback:
          'Documentación completa. Ingresos verificados. Pendiente llamada al empleador.',
      },
      {
        property_id: properties[2].id,
        applicant_id: byEmail('sofia.rojas@gmail.com'),
        status: 'PENDIENTE',
        personal_data: JSON.stringify({
          full_name: 'Sofía Rojas Mendoza',
          phone: '70077885',
          identity_document: 'CI: 7654321 CB',
          current_address: 'Calle Colón #500, Cochabamba',
          birth_date: '1993-11-03',
        }),
        employment_data: JSON.stringify({
          employer_name: 'Freelance — Diseño Gráfico',
          position: 'Diseñadora Independiente',
          monthly_income: 8500.0,
          employment_duration: '3 años',
          employer_phone: null,
        }),
        rental_history: JSON.stringify([]),
        references: JSON.stringify([
          {
            name: 'Lic. Marco Suárez',
            relationship: 'Cliente frecuente',
            phone: '70088001',
          },
        ]),
        additional_notes:
          'Primera vez alquilando oficina propia. Puedo entregar cartas de clientes como respaldo de ingresos.',
        admin_feedback: null,
      },
      {
        property_id: properties[3].id,
        applicant_id: byEmail('ana.flores@gmail.com'),
        status: 'APROBADA',
        personal_data: JSON.stringify({
          full_name: 'Luis Chávez Romero',
          phone: '76655443',
          identity_document: 'CI: 6543210 LP',
          current_address: 'Villa Dolores, El Alto',
          birth_date: '2000-04-22',
        }),
        employment_data: JSON.stringify({
          employer_name: 'Universidad Mayor de San Andrés',
          position: 'Estudiante de Medicina (6to año)',
          monthly_income: 3500.0,
          employment_duration: 'Beca completa + apoyo familiar',
          employer_phone: '22443355',
        }),
        rental_history: JSON.stringify([]),
        references: JSON.stringify([
          {
            name: 'Dr. Ernesto Chávez',
            relationship: 'Padre',
            phone: '70011223',
          },
        ]),
        additional_notes:
          'Estudiante responsable. El alquiler lo cubre mi familia. Pueden verificar con mis padres.',
        admin_feedback:
          'Aprobada. Buen perfil para el estudio. Contrato generado como CTR-2023-001.',
      },
    ];

    for (const a of applications) {
      if (!a.applicant_id) continue;

      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schema)}.rental_applications
           (property_id, applicant_id, status, personal_data, employment_data,
            rental_history, "references", additional_notes, admin_feedback,
            screening_fee_paid, created_at, updated_at)
         VALUES ($1,$2,
           $3::${quoteIdent(schema)}.application_status_enum,
           $4,$5,$6,$7,$8,$9,false,NOW(),NOW())`,
        [
          a.property_id,
          a.applicant_id,
          a.status,
          a.personal_data,
          a.employment_data,
          a.rental_history,
          a.references,
          a.additional_notes,
          a.admin_feedback,
        ],
      );
    }

    this.logger.log(
      '  ✔ Solicitudes de alquiler semilla creadas (3 solicitudes)',
    );
  }
}
