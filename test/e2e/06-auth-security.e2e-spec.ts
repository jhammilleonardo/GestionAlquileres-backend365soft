/**
 * E2E #6 — Seguridad de autenticación
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Forzar intentos fallidos hasta activar lockout por cuenta
 *  3. Verificar estado de lockout y eventos en public.auth_security_events
 *  4. Intentar usar JWT de un tenant en otra URL y auditar TENANT_MISMATCH
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
} from '../helpers/app.factory';

const SLUG = 'e2e-auth-security';
const OTHER_SLUG = 'e2e-auth-other';
const ADMIN_EMAIL = 'admin@e2e-auth-security.com';

describe('E2E #6 — Seguridad de autenticación', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;

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

  it('1. registra empresa + admin', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Auth Security E2E',
        country: 'BO',
        name: 'Admin Auth Security',
        email: ADMIN_EMAIL,
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as { access_token?: string };
    adminToken = body.access_token ?? '';
    expect(adminToken).toBeDefined();
  });

  it('2. bloquea la cuenta despues de intentos fallidos por tenant login', async () => {
    for (let attempt = 1; attempt <= 5; attempt += 1) {
      await request(httpServer)
        .post(`/auth/${SLUG}/login`)
        .send({ email: ADMIN_EMAIL, password: 'WrongPassword365!' })
        .expect(401);
    }

    await request(httpServer)
      .post(`/auth/${SLUG}/login`)
      .send({ email: ADMIN_EMAIL, password: 'WrongPassword365!' })
      .expect(429);

    const [attemptRow] = await dataSource.query<
      Array<{ failed_count: number; is_locked: boolean }>
    >(
      `SELECT failed_count, locked_until > NOW() AS is_locked
       FROM public.auth_login_attempts
       WHERE email = LOWER($1)
         AND tenant_slug = $2
         AND login_context = 'tenant_login'`,
      [ADMIN_EMAIL, SLUG],
    );

    expect(attemptRow).toMatchObject({
      failed_count: 5,
      is_locked: true,
    });

    const [eventRow] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM public.auth_security_events
       WHERE email = LOWER($1)
         AND tenant_slug = $2
         AND event_type = 'LOGIN_LOCKED'`,
      [ADMIN_EMAIL, SLUG],
    );

    expect(Number(eventRow.count)).toBeGreaterThan(0);
  });

  it('3. audita tenant mismatch cuando el JWT se usa contra otro slug', async () => {
    await request(httpServer)
      .get(`/${OTHER_SLUG}/admin/config`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(401);

    const [eventRow] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM public.auth_security_events
       WHERE email = LOWER($1)
         AND tenant_slug = $2
         AND event_type = 'TENANT_MISMATCH'
         AND reason = 'url_slug_mismatch'`,
      [ADMIN_EMAIL, OTHER_SLUG],
    );

    expect(Number(eventRow.count)).toBeGreaterThan(0);
  });

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
    await dropTenantSchema(dataSource, OTHER_SLUG);
    await dataSource.query(
      `DELETE FROM public.auth_login_attempts WHERE email = LOWER($1)`,
      [ADMIN_EMAIL],
    );
    await dataSource.query(
      `DELETE FROM public.auth_security_events WHERE email = LOWER($1)`,
      [ADMIN_EMAIL],
    );
  }
});
