/**
 * E2E #8 — Aislamiento real entre tenants
 *
 * Flujo:
 *  1. Registrar tenant A y tenant B
 *  2. Crear una propiedad en A
 *  3. Verificar que A la ve
 *  4. Verificar que B no la ve
 *  5. Verificar que token de A no puede usarse contra URL de B
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const TENANT_A = {
  slug: 'e2e-isolation-a',
  companyName: 'Empresa Isolation A',
  adminEmail: 'admin@e2e-isolation-a.com',
};

const TENANT_B = {
  slug: 'e2e-isolation-b',
  companyName: 'Empresa Isolation B',
  adminEmail: 'admin@e2e-isolation-b.com',
};

interface PropertyListResponse {
  items: Array<{ id: number; title: string }>;
  total: number;
}

describe('E2E #8 — Tenant isolation', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminTokenA: string;
  let adminTokenB: string;
  let propertyIdA: number;
  let propertyTitleA: string;

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
    adminTokenA = await registerTenant(TENANT_A);
    adminTokenB = await registerTenant(TENANT_B);

    expect(adminTokenA).toBeDefined();
    expect(adminTokenB).toBeDefined();
  });

  it('2. crea una propiedad solo en tenant A', async () => {
    const { typeId, subtypeId } = await seedPublicPropertyTypes(
      dataSource,
      TENANT_A.slug,
    );
    propertyTitleA = `Propiedad A ${Date.now()}`;

    const res = await request(httpServer)
      .post(`/${TENANT_A.slug}/admin/properties`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .send({
        title: propertyTitleA,
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 800,
        currency: 'BOB',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Isolation A 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);

    const body = res.body as { id?: number };
    propertyIdA = body.id ?? 0;
    expect(propertyIdA).toBeGreaterThan(0);
  });

  it('3. tenant A ve su propiedad', async () => {
    const res = await request(httpServer)
      .get(`/${TENANT_A.slug}/admin/properties`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(200);

    const body = res.body as PropertyListResponse;
    expect(body.total).toBeGreaterThanOrEqual(1);
    expect(
      body.items.some(
        (property) =>
          property.id === propertyIdA && property.title === propertyTitleA,
      ),
    ).toBe(true);
  });

  it('4. tenant B no ve datos de tenant A', async () => {
    const res = await request(httpServer)
      .get(`/${TENANT_B.slug}/admin/properties`)
      .set('Authorization', `Bearer ${adminTokenB}`)
      .expect(200);

    const body = res.body as PropertyListResponse;
    expect(body.items).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('5. token de tenant A no autoriza URL de tenant B', async () => {
    await request(httpServer)
      .get(`/${TENANT_B.slug}/admin/properties`)
      .set('Authorization', `Bearer ${adminTokenA}`)
      .expect(401);

    const [eventRow] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM public.auth_security_events
       WHERE email = LOWER($1)
         AND tenant_slug = $2
         AND event_type = 'TENANT_MISMATCH'
         AND reason = 'url_slug_mismatch'`,
      [TENANT_A.adminEmail, TENANT_B.slug],
    );

    expect(Number(eventRow.count)).toBeGreaterThan(0);
  });

  async function registerTenant(tenant: {
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

    const body = res.body as { access_token?: string };
    return body.access_token ?? '';
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, TENANT_A.slug);
    await dropTenantSchema(dataSource, TENANT_B.slug);
    await dataSource.query(
      `DELETE FROM public.auth_login_attempts
       WHERE email IN (LOWER($1), LOWER($2))`,
      [TENANT_A.adminEmail, TENANT_B.adminEmail],
    );
    await dataSource.query(
      `DELETE FROM public.auth_security_events
       WHERE email IN (LOWER($1), LOWER($2))`,
      [TENANT_A.adminEmail, TENANT_B.adminEmail],
    );
  }
});
