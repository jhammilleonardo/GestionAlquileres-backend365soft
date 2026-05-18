/**
 * E2E #7 — Provisioning completo e idempotencia de startup upgrades
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Verificar tablas públicas de soporte
 *  3. Verificar tablas críticas del schema tenant
 *  4. Ejecutar startup upgrades dos veces y verificar que el schema sigue completo
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { TenantProvisioningService } from '../../src/tenants/tenant-provisioning.service';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
} from '../helpers/app.factory';

const SLUG = 'e2e-provisioning';
const ADMIN_EMAIL = 'admin@e2e-provisioning.com';

const PUBLIC_SUPPORT_TABLES = [
  'tenant',
  'admin_index',
  'auth_login_attempts',
  'auth_security_events',
] as const;

const TENANT_CRITICAL_TABLES = [
  'user',
  'tenant_config',
  'property_types',
  'property_subtypes',
  'properties',
  'property_addresses',
  'property_owners',
  'rental_owners',
  'units',
  'contracts',
  'contract_history',
  'contract_templates',
  'maintenance_requests',
  'maintenance_messages',
  'maintenance_stage_history',
  'vendors',
  'notifications',
  'notification_templates',
  'payments',
  'payment_schedules',
  'payment_refunds',
  'payment_splits',
  'webhook_events',
  'owner_statements',
  'expenses',
  'rental_applications',
  'screening_checklist',
  'employee_permissions',
  'inspections',
  'violations',
  'audit_logs',
  'tenant_website',
  'website_contacts',
] as const;

describe('E2E #7 — Provisioning e idempotencia', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let tenantProvisioningService: TenantProvisioningService;
  const schemaName = schemaNameFromSlug(SLUG);

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    tenantProvisioningService = app.get(TenantProvisioningService);
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
        company_name: 'Empresa Provisioning E2E',
        country: 'BO',
        name: 'Admin Provisioning',
        email: ADMIN_EMAIL,
        password: 'Admin365Soft!',
      })
      .expect(201);

    expect(res.body).toMatchObject({
      tenant: { slug: SLUG },
      user: { email: ADMIN_EMAIL, role: 'ADMIN' },
    });
  });

  it('2. crea las tablas públicas de soporte', async () => {
    const tables = await getExistingTables('public', PUBLIC_SUPPORT_TABLES);

    expect(tables.sort()).toEqual([...PUBLIC_SUPPORT_TABLES].sort());
  });

  it('3. crea las tablas críticas del tenant nuevo', async () => {
    const tables = await getExistingTables(schemaName, TENANT_CRITICAL_TABLES);

    expect(tables.sort()).toEqual([...TENANT_CRITICAL_TABLES].sort());
  });

  it('4. startup upgrades son idempotentes', async () => {
    await tenantProvisioningService.runStartupUpgrades();
    await tenantProvisioningService.runStartupUpgrades();

    const tables = await getExistingTables(schemaName, TENANT_CRITICAL_TABLES);
    expect(tables.sort()).toEqual([...TENANT_CRITICAL_TABLES].sort());

    const [tenantRow] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM public.tenant
       WHERE slug = $1 AND schema_name = $2`,
      [SLUG, schemaName],
    );
    expect(Number(tenantRow.count)).toBe(1);
  });

  async function getExistingTables(
    schema: string,
    expectedTables: readonly string[],
  ): Promise<string[]> {
    const rows = await dataSource.query<Array<{ table_name: string }>>(
      `SELECT table_name
       FROM information_schema.tables
       WHERE table_schema = $1
         AND table_name = ANY($2::text[])
       ORDER BY table_name`,
      [schema, [...expectedTables]],
    );

    return rows.map((row) => row.table_name);
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
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
