/**
 * E2E #5 — Contrato por vencer → cron dispara notificación → admin recibe alerta
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Crear inquilino, propiedad y contrato que vence en 15 días
 *  3. Ejecutar el cron de lifecycle para contratos por vencer
 *  4. Verificar que se creó al menos una notificación de tipo contract.expiring.*
 *  5. Admin consulta sus notificaciones — aparece la alerta de vencimiento
 *  6. Admin marca la notificación como leída
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  closeTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';
import { LifecycleNotificationsCron } from '../../src/lifecycle-notifications/lifecycle-notifications.cron';

const SLUG = 'e2e-expiry';

describe('E2E #5 — Contrato por vencer → cron → notificación al admin', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let propertyId: number;
  let tenantUserId: number;
  let notificationId: number;
  let typeId: number;
  let subtypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    dataSource = app.get(DataSource);
    await dropTenantSchema(dataSource, SLUG);
  });

  afterAll(async () => {
    await dropTenantSchema(dataSource, SLUG);
    await closeTestApp();
  });

  it('1. registra empresa + admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Expiry E2E',
        country: 'BO',
        name: 'Admin Expiry',
        email: 'admin@e2e-expiry.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    adminToken = res.body.access_token as string;
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. crea inquilino, propiedad y contrato que vence en 15 días', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const tenantRes = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Expiry',
        email: 'expiry@inquilino.com',
        password: 'Inquilino365Ok!',
        phone: '70000030',
      })
      .expect(201);

    tenantUserId = tenantRes.body.id as number;

    const propRes = await request(app.getHttpServer())
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto Expiry',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 700,
        currency: 'USD',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Expiry 300',
            city: 'Santa Cruz',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);

    propertyId = propRes.body.id as number;

    // Contrato que vence exactamente en 15 días
    const startDate = new Date(Date.now() - 350 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];
    const endDate = new Date(Date.now() + 15 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    await dataSource.query(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, 700, 'USD', $3, $4, 'ACTIVO', 'CTR-E2E-005', 5, NOW(), NOW())`,
      [tenantUserId, propertyId, startDate, endDate],
    );
  });

  it('3. el cron de lifecycle dispara la verificación de contratos por vencer', async () => {
    const lifecycleCron = app.get(LifecycleNotificationsCron);
    await expect(lifecycleCron.runContractExpiryCheck()).resolves.not.toThrow();
  });

  it('4. se creó al menos una notificación de vencimiento en la base de datos', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const rows = await dataSource.query<{ id: number; event_type: string }[]>(
      `SELECT id, event_type FROM "${schema}".notifications
       WHERE event_type IN (
         'contract.expiring.60', 'contract.expiring.30', 'contract.expiring.15'
       )
       ORDER BY created_at DESC
       LIMIT 5`,
    );

    expect(rows.length).toBeGreaterThan(0);
    notificationId = rows[0].id;
  });

  it('5. el admin ve la alerta de vencimiento en su centro de notificaciones', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/notifications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const notifications = res.body as { id: number; event_type: string }[];
    const found = notifications.find((n) =>
      [
        'contract.expiring.60',
        'contract.expiring.30',
        'contract.expiring.15',
      ].includes(n.event_type),
    );

    expect(found).toBeDefined();
    notificationId = found!.id;
  });

  it('6. el admin marca la notificación como leída', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/notifications/${notificationId}/read`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.is_read).toBe(true);
    expect(res.body.read_at).not.toBeNull();
  });
});
