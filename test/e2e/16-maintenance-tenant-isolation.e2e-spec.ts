/**
 * E2E #16 - Aislamiento tenant en maintenance
 *
 * Valida con PostgreSQL real que una solicitud creada en tenant A:
 *  1. Es visible para tenant A.
 *  2. No aparece en tenant B.
 *  3. No puede consultarse desde tenant B con token de tenant A.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const TENANT_A = {
  slug: 'e2e-maint-isolation-a',
  companyName: 'Empresa Maintenance Isolation A',
  adminEmail: 'admin@e2e-maint-isolation-a.com',
  tenantEmail: 'tenant@e2e-maint-isolation-a.com',
};

const TENANT_B = {
  slug: 'e2e-maint-isolation-b',
  companyName: 'Empresa Maintenance Isolation B',
  adminEmail: 'admin@e2e-maint-isolation-b.com',
};

interface AuthTokenBody {
  access_token?: string;
}

interface IdBody {
  id?: number;
}

describe('E2E #16 - Maintenance tenant isolation', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminTokenA: string;
  let adminTokenB: string;
  let tenantTokenA: string;
  let tenantUserIdA: number;
  let propertyIdA: number;
  let contractIdA: number;
  let maintenanceIdA: number;

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

  it('1. registra tenant A y tenant B', async () => {
    adminTokenA = await registerAdmin(TENANT_A);
    adminTokenB = await registerAdmin(TENANT_B);

    expect(adminTokenA).toBeTruthy();
    expect(adminTokenB).toBeTruthy();
  });

  it('2. crea inquilino, propiedad, contrato y solicitud en tenant A', async () => {
    const { typeId, subtypeId } = await seedPublicPropertyTypes(
      dataSource,
      TENANT_A.slug,
    );
    const schemaA = schemaNameFromSlug(TENANT_A.slug);

    const tenantRes = await request(httpServer)
      .post(`/auth/${TENANT_A.slug}/register`)
      .send({
        name: 'Tenant Maintenance Isolation A',
        email: TENANT_A.tenantEmail,
        password: 'Tenant365Soft!',
        phone: '70001610',
      })
      .expect(201);
    tenantUserIdA = (tenantRes.body as IdBody).id ?? 0;

    const loginRes = await request(httpServer)
      .post(`/auth/${TENANT_A.slug}/login`)
      .send({
        email: TENANT_A.tenantEmail,
        password: 'Tenant365Soft!',
      })
      .expect(200);
    tenantTokenA = (loginRes.body as AuthTokenBody).access_token ?? '';

    const propertyRes = await request(httpServer)
      .post(`/${TENANT_A.slug}/admin/properties`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        title: 'Depto Maintenance Isolation A',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 900,
        currency: 'BOB',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Maintenance Isolation A 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);
    propertyIdA = (propertyRes.body as IdBody).id ?? 0;

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const contractRows = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schemaA}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, 900, 'BOB', $3, $4, 'ACTIVO', 'CTR-E2E-016-A', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserIdA, propertyIdA, today, nextYear],
    );
    contractIdA = contractRows[0].id;

    const maintenanceRes = await request(httpServer)
      .post(`/${TENANT_A.slug}/tenant/maintenance`)
      .set('Authorization', `Bearer ${tenantTokenA}`)
      .send({
        request_type: 'MAINTENANCE',
        category: 'PLOMERIA',
        title: 'Solicitud aislada tenant A',
        description: 'Debe existir solo en tenant A.',
        permission_to_enter: 'YES',
        has_pets: false,
        contract_id: contractIdA,
      })
      .expect(201);
    maintenanceIdA = (maintenanceRes.body as IdBody).id ?? 0;
    expect(maintenanceIdA).toBeGreaterThan(0);
  });

  it('3. tenant A ve su solicitud de maintenance', async () => {
    const res = await request(httpServer)
      .get(`/${TENANT_A.slug}/admin/maintenance`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const items = res.body as Array<{ id: number; title?: string }>;
    expect(items.some((item) => item.id === maintenanceIdA)).toBe(true);
  });

  it('4. tenant B no ve solicitudes de tenant A', async () => {
    const res = await request(httpServer)
      .get(`/${TENANT_B.slug}/admin/maintenance`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const items = res.body as Array<{ id: number; title?: string }>;
    expect(items).toEqual([]);
  });

  it('5. token de tenant A no puede consultar maintenance en tenant B', async () => {
    await request(httpServer)
      .get(`/${TENANT_B.slug}/admin/maintenance/${maintenanceIdA}`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(401);
  });

  async function registerAdmin(tenant: {
    slug: string;
    companyName: string;
    adminEmail: string;
  }): Promise<string> {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: tenant.slug,
        company_name: tenant.companyName,
        country: 'BO',
        name: `Admin ${tenant.slug}`,
        email: tenant.adminEmail,
        password: 'Admin365Soft!',
      })
      .expect(201);

    return (res.body as AuthTokenBody).access_token ?? '';
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, TENANT_A.slug);
    await dropTenantSchema(dataSource, TENANT_B.slug);
  }
});
