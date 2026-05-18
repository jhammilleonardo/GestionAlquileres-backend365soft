/**
 * E2E #13 - Mensajes y adjuntos de mantenimiento
 *
 * Valida con PostgreSQL real que:
 *  1. Un tenant crea una solicitud con adjunto inicial.
 *  2. El admin envía un mensaje enlazando ese adjunto y agregando otro.
 *  3. Los adjuntos quedan asociados al mensaje sin perder la solicitud.
 *  4. Se emite notificación al tenant por el mensaje recibido.
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

const SLUG = 'e2e-maintenance-messages';
const INITIAL_FILE_URL =
  '/storage/maintenance/e2e-maintenance-messages/initial.pdf';
const MESSAGE_FILE_URL =
  '/storage/maintenance/e2e-maintenance-messages/message.jpg';

describe('E2E #13 - Maintenance messages and attachments', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;
  let tenantToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let contractId: number;
  let maintenanceId: number;
  let messageId: number;
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

  it('1. registra empresa y datos base', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Maintenance Messages E2E',
        country: 'BO',
        name: 'Admin Maintenance Messages',
        email: 'admin@e2e-maintenance-messages.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as { access_token?: string };
    adminToken = body.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. crea inquilino, propiedad y contrato activo', async () => {
    const tenantRes = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Maintenance Messages',
        email: 'tenant@e2e-maintenance-messages.com',
        password: 'Tenant365Soft!',
        phone: '70001310',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    const tenantLogin = await request(httpServer)
      .post(`/auth/${SLUG}/login`)
      .send({
        email: 'tenant@e2e-maintenance-messages.com',
        password: 'Tenant365Soft!',
      })
      .expect(200);

    const loginBody = tenantLogin.body as { access_token?: string };
    tenantToken = loginBody.access_token ?? '';

    const propertyRes = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto Maintenance Messages',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 700,
        currency: 'BOB',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Maintenance Messages 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);

    const propertyBody = propertyRes.body as { id?: number };
    propertyId = propertyBody.id ?? 0;

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const contractRows = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, 700, 'BOB', $3, $4, 'ACTIVO', 'CTR-E2E-013', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserId, propertyId, today, nextYear],
    );

    contractId = contractRows[0].id;
  });

  it('3. el tenant crea solicitud con adjunto inicial', async () => {
    const res = await request(httpServer)
      .post(`/${SLUG}/tenant/maintenance`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        request_type: 'MAINTENANCE',
        category: 'PLOMERIA',
        title: 'Fuga con adjunto',
        description: 'La tubería del lavamanos tiene fuga visible.',
        permission_to_enter: 'YES',
        has_pets: false,
        contract_id: contractId,
        files: [INITIAL_FILE_URL],
      })
      .expect(201);

    const body = res.body as { id?: number; current_stage?: string };
    maintenanceId = body.id ?? 0;
    expect(maintenanceId).toBeGreaterThan(0);
    expect(body.current_stage).toBe('REPORTED');

    const [attachmentCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".maintenance_attachments
       WHERE maintenance_request_id = $1
         AND file_url = $2
         AND message_id IS NULL`,
      [maintenanceId, INITIAL_FILE_URL],
    );
    expect(Number(attachmentCount.total)).toBe(1);
  });

  it('4. el admin envía mensaje y enlaza/agrega adjuntos', async () => {
    const res = await request(httpServer)
      .post(`/${SLUG}/admin/maintenance/${maintenanceId}/messages`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        message: 'Revisamos el caso. Se agenda visita técnica.',
        send_to_resident: true,
        files: [INITIAL_FILE_URL, MESSAGE_FILE_URL],
      })
      .expect(201);

    const body = res.body as {
      id?: number;
      maintenance_request_id?: number;
      attachments?: Array<{ file_url: string }>;
    };
    messageId = body.id ?? 0;

    expect(messageId).toBeGreaterThan(0);
    expect(body.maintenance_request_id).toBe(maintenanceId);
    expect(body.attachments?.map((file) => file.file_url).sort()).toEqual(
      [INITIAL_FILE_URL, MESSAGE_FILE_URL].sort(),
    );

    const [linkedCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".maintenance_attachments
       WHERE maintenance_request_id = $1
         AND message_id = $2`,
      [maintenanceId, messageId],
    );
    expect(Number(linkedCount.total)).toBe(2);

    const [requestCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".maintenance_requests
       WHERE id = $1`,
      [maintenanceId],
    );
    expect(Number(requestCount.total)).toBe(1);
  });

  it('5. el tenant ve el mensaje y recibe notificación', async () => {
    const messagesRes = await request(httpServer)
      .get(`/${SLUG}/tenant/maintenance/${maintenanceId}/messages`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .expect(200);

    const messages = messagesRes.body as Array<{
      id: number;
      attachments?: Array<{ file_url: string }>;
    }>;
    const message = messages.find((item) => item.id === messageId);
    expect(message).toBeDefined();
    expect(message?.attachments?.length).toBe(2);

    const [notificationCount] = await dataSource.query<
      Array<{ total: string }>
    >(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".notifications
       WHERE user_id = $1
         AND event_type = 'maintenance.message.received'
         AND metadata->>'maintenance_request_id' = $2`,
      [tenantUserId, String(maintenanceId)],
    );
    expect(Number(notificationCount.total)).toBeGreaterThanOrEqual(1);
  });

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
  }
});
