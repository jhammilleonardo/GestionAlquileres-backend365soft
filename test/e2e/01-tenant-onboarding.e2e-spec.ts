/**
 * E2E #1 — Registro de empresa → configuración del tenant → acceso al dashboard
 *
 * Flujo:
 *  1. POST /auth/register-admin  → crea empresa + admin
 *  2. POST /auth/login-admin     → obtiene JWT
 *  3. GET  /:slug/admin/config   → lee configuración inicial
 *  4. PATCH /:slug/admin/config  → actualiza configuración
 *  5. GET  /auth/me              → verifica acceso autenticado (dashboard)
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  closeTestApp,
  dropTenantSchema,
} from '../helpers/app.factory';

const SLUG = 'e2e-onboarding';

interface RegisterAdminBody {
  tenant?: { slug?: string };
  user?: { email?: string; role?: string };
  access_token?: string;
}

interface AuthTokenBody {
  access_token?: string;
}

interface TenantConfigBody {
  currency?: string;
  timezone?: string;
}

interface AuthMeBody {
  email?: string;
  role?: string;
}

describe('E2E #1 — Tenant onboarding', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    // Limpiar tenant previo si quedó de una ejecución anterior
    await dropTenantSchema(dataSource, SLUG);
  });

  afterAll(async () => {
    await dropTenantSchema(dataSource, SLUG);
    await closeTestApp();
  });

  it('1. registra una empresa con su admin', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa E2E Onboarding',
        country: 'BO',
        name: 'Admin E2E',
        email: 'admin@e2e-onboarding.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as RegisterAdminBody;
    expect(body).toMatchObject({
      tenant: { slug: SLUG },
      user: { email: 'admin@e2e-onboarding.com', role: 'ADMIN' },
    });
    expect(body.access_token).toBeDefined();
  });

  it('2. el admin puede hacer login con sus credenciales', async () => {
    const res = await request(httpServer)
      .post('/auth/login-admin')
      .send({ email: 'admin@e2e-onboarding.com', password: 'Admin365Soft!' })
      .expect(200);

    const body = res.body as AuthTokenBody;
    expect(body.access_token).toBeDefined();
    adminToken = body.access_token ?? '';
  });

  it('3. lee la configuración inicial del tenant', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as TenantConfigBody;
    expect(body).toMatchObject({
      currency: 'BOB',
      timezone: 'America/La_Paz',
    });
  });

  it('4. actualiza la zona horaria del tenant y la verifica con GET', async () => {
    await request(httpServer)
      .patch(`/${SLUG}/admin/config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ timezone: 'America/Bogota' })
      .expect(200);

    const res = await request(httpServer)
      .get(`/${SLUG}/admin/config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as TenantConfigBody;
    expect(body.timezone).toBe('America/Bogota');
  });

  it('5. verifica acceso al perfil (dashboard ready)', async () => {
    const res = await request(httpServer)
      .get('/auth/me')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const body = res.body as AuthMeBody;
    expect(body).toMatchObject({
      email: 'admin@e2e-onboarding.com',
      role: 'ADMIN',
    });
  });

  it('6. rechaza acceso sin token', async () => {
    await request(httpServer).get(`/${SLUG}/admin/config`).expect(401);
  });
});
