/**
 * E2E #14 - Owner Portal ownership
 *
 * Valida con PostgreSQL real que el portal de propietario:
 *  1. Solo muestra propiedades/liquidaciones del propietario autenticado.
 *  2. Rechaza PDFs de liquidaciones de otro propietario.
 *  3. Autoriza mantenimiento solo si la solicitud pertenece al propietario y
 *     la propiedad está en Bolivia.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcrypt';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-owner-portal';
const OWNER_1_EMAIL = 'owner1@e2e-owner-portal.com';
const OWNER_2_EMAIL = 'owner2@e2e-owner-portal.com';
const OWNER_PASSWORD = 'Owner365Soft!';

describe('E2E #14 - Owner Portal ownership', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let ownerToken: string;
  let tenantUserId: number;
  let owner1Id: number;
  let owner2Id: number;
  let owner1BoliviaPropertyId: number;
  let owner1ChilePropertyId: number;
  let owner2PropertyId: number;
  let owner1StatementId: number;
  let owner2StatementId: number;
  let owner1BoliviaMaintenanceId: number;
  let owner1ChileMaintenanceId: number;
  let owner2MaintenanceId: number;
  let typeId: number;
  let subtypeId: number;
  const schema = schemaNameFromSlug(SLUG);

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    await cleanup();
  });

  afterAll(async () => {
    await cleanup();
    await closeTestApp();
  });

  it('1. registra empresa, inquilino y datos base del propietario', async () => {
    await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Owner Portal E2E',
        country: 'BO',
        name: 'Admin Owner Portal',
        email: 'admin@e2e-owner-portal.com',
        password: 'Admin365Soft!',
      })
      .expect(201);
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));

    const tenantRes = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Owner Portal',
        email: 'tenant@e2e-owner-portal.com',
        password: 'Tenant365Soft!',
        phone: '70001410',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    await seedOwnerPortalData();

    const ownerLogin = await request(httpServer)
      .post(`/auth/${SLUG}/owner/login`)
      .send({ email: OWNER_1_EMAIL, password: OWNER_PASSWORD })
      .expect(200);

    const ownerLoginBody = ownerLogin.body as {
      access_token?: string;
      user?: { rental_owner_id?: number };
    };
    ownerToken = ownerLoginBody.access_token ?? '';
    expect(ownerLoginBody.user?.rental_owner_id).toBe(owner1Id);
  });

  it('2. el propietario solo ve sus propiedades', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/owner/properties`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const properties = res.body as Array<{ id: number; title: string }>;
    const propertyIds = properties.map((property) => property.id).sort();

    expect(propertyIds).toEqual(
      [owner1BoliviaPropertyId, owner1ChilePropertyId].sort(),
    );
    expect(propertyIds).not.toContain(owner2PropertyId);
  });

  it('3. el propietario solo ve sus liquidaciones', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/owner/statements`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const statements = res.body as Array<{ id: number; property_id: number }>;
    expect(statements.map((statement) => statement.id)).toEqual([
      owner1StatementId,
    ]);
    expect(statements[0].property_id).toBe(owner1BoliviaPropertyId);
  });

  it('4. no permite descargar PDF de liquidación de otro propietario', async () => {
    await request(httpServer)
      .get(`/${SLUG}/owner/statements/${owner2StatementId}/pdf`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);
  });

  it('5. autoriza mantenimiento solo propio y en Bolivia', async () => {
    await request(httpServer)
      .patch(`/${SLUG}/owner/maintenance/${owner2MaintenanceId}/authorize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);

    await request(httpServer)
      .patch(`/${SLUG}/owner/maintenance/${owner1ChileMaintenanceId}/authorize`)
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(403);

    await request(httpServer)
      .patch(
        `/${SLUG}/owner/maintenance/${owner1BoliviaMaintenanceId}/authorize`,
      )
      .set('Authorization', `Bearer ${ownerToken}`)
      .expect(200);

    const [maintenanceRow] = await dataSource.query<
      Array<{ owner_authorized: boolean }>
    >(
      `SELECT owner_authorized
       FROM "${schema}".maintenance_requests
       WHERE id = $1`,
      [owner1BoliviaMaintenanceId],
    );
    expect(maintenanceRow.owner_authorized).toBe(true);
  });

  async function seedOwnerPortalData(): Promise<void> {
    const ownerPasswordHash = await bcrypt.hash(OWNER_PASSWORD, 12);

    const ownerRows = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".rental_owners
         (name, primary_email, phone_number, is_active, created_at, updated_at)
       VALUES
         ('Owner Portal Uno', $1, '70001411', true, NOW(), NOW()),
         ('Owner Portal Dos', $2, '70001412', true, NOW(), NOW())
       RETURNING id`,
      [OWNER_1_EMAIL, OWNER_2_EMAIL],
    );
    owner1Id = ownerRows[0].id;
    owner2Id = ownerRows[1].id;

    await dataSource.query(
      `INSERT INTO "${schema}"."user"
         (name, email, password, role, is_active, created_at, updated_at)
       VALUES
         ('Owner Portal Uno', $1, $3, 'PROPIETARIO', true, NOW(), NOW()),
         ('Owner Portal Dos', $2, $3, 'PROPIETARIO', true, NOW(), NOW())`,
      [OWNER_1_EMAIL, OWNER_2_EMAIL, ownerPasswordHash],
    );

    owner1BoliviaPropertyId = await insertProperty(
      'Propiedad Owner Bolivia',
      'Bolivia',
      owner1Id,
    );
    owner1ChilePropertyId = await insertProperty(
      'Propiedad Owner Chile',
      'Chile',
      owner1Id,
    );
    owner2PropertyId = await insertProperty(
      'Propiedad Otro Owner',
      'Bolivia',
      owner2Id,
    );

    const contractId = await insertContract(owner1BoliviaPropertyId, 1);
    await insertContract(owner1ChilePropertyId, 2);
    await insertContract(owner2PropertyId, 3);

    owner1StatementId = await insertOwnerStatement(
      owner1Id,
      owner1BoliviaPropertyId,
    );
    owner2StatementId = await insertOwnerStatement(owner2Id, owner2PropertyId);

    owner1BoliviaMaintenanceId = await insertMaintenance(
      owner1BoliviaPropertyId,
      contractId,
      'MNT-E2E-OWNER-BO',
    );
    owner1ChileMaintenanceId = await insertMaintenance(
      owner1ChilePropertyId,
      await findContractId(owner1ChilePropertyId),
      'MNT-E2E-OWNER-CL',
    );
    owner2MaintenanceId = await insertMaintenance(
      owner2PropertyId,
      await findContractId(owner2PropertyId),
      'MNT-E2E-OWNER-OTHER',
    );
  }

  async function insertProperty(
    title: string,
    country: string,
    ownerId: number,
  ): Promise<number> {
    const [property] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".properties
         (title, property_type_id, property_subtype_id, status, monthly_rent,
          currency, created_at, updated_at)
       VALUES ($1, $2, $3, 'OCUPADO', 900, 'BOB', NOW(), NOW())
       RETURNING id`,
      [title, typeId, subtypeId],
    );

    await dataSource.query(
      `INSERT INTO "${schema}".property_addresses
         (property_id, address_type, street_address, city, country, created_at)
       VALUES ($1, 'address_1', $2, 'La Paz', $3, NOW())`,
      [property.id, `Av. ${title}`, country],
    );

    await dataSource.query(
      `INSERT INTO "${schema}".property_owners
         (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
       VALUES ($1, $2, 100, true, NOW())`,
      [property.id, ownerId],
    );

    return property.id;
  }

  async function insertContract(
    propertyId: number,
    index: number,
  ): Promise<number> {
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const [contract] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, is_signed, pdf_url, created_at, updated_at)
       VALUES ($1, $2, 900, 'BOB', $3, $4, 'ACTIVO', $5, 5, true, $6, NOW(), NOW())
       RETURNING id`,
      [
        tenantUserId,
        propertyId,
        today,
        nextYear,
        `CTR-E2E-OWNER-${index}`,
        `/storage/contracts/owner-${index}.pdf`,
      ],
    );

    return contract.id;
  }

  async function findContractId(propertyId: number): Promise<number> {
    const [contract] = await dataSource.query<Array<{ id: number }>>(
      `SELECT id
       FROM "${schema}".contracts
       WHERE property_id = $1
       LIMIT 1`,
      [propertyId],
    );

    return contract.id;
  }

  async function insertOwnerStatement(
    ownerId: number,
    propertyId: number,
  ): Promise<number> {
    const [statement] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".owner_statements
         (rental_owner_id, property_id, period_month, period_year, gross_rent,
          maintenance_deduction, management_commission, net_amount, currency,
          payment_count, status, generated_at, created_at, updated_at)
       VALUES ($1, $2, 4, 2026, 900, 0, 90, 810, 'BOB', 1, 'pending', NOW(), NOW(), NOW())
       RETURNING id`,
      [ownerId, propertyId],
    );

    return statement.id;
  }

  async function insertMaintenance(
    propertyId: number,
    contractId: number,
    ticketNumber: string,
  ): Promise<number> {
    const [maintenance] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".maintenance_requests
         (ticket_number, request_type, category, title, description,
          permission_to_enter, has_pets, status, priority, tenant_id,
          contract_id, property_id, current_stage, owner_authorized,
          created_at, updated_at)
       VALUES ($1, 'MAINTENANCE', 'PLOMERIA', $2, $3, 'YES', false, 'NEW',
               'NORMAL', $4, $5, $6, 'SCHEDULED', false, NOW(), NOW())
       RETURNING id`,
      [
        ticketNumber,
        `Solicitud ${ticketNumber}`,
        'Solicitud para validación owner portal',
        tenantUserId,
        contractId,
        propertyId,
      ],
    );

    return maintenance.id;
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
  }
});
