/**
 * E2E #10 - Webhook de pago idempotente y transaccional
 *
 * Valida que un webhook externo:
 *  1. Actualiza el pago por reference_number.
 *  2. Registra el evento una sola vez.
 *  3. Ignora el mismo event_id en reintentos.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { PaymentWebhookService } from '../../src/payments/payment-webhook.service';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-payment-webhook';
const WEBHOOK_EVENT_ID = 'evt_e2e_payment_webhook_001';
const PAYMENT_REFERENCE = 'wh-e2e-001';

describe('E2E #10 - Payment webhook idempotency', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let webhookService: PaymentWebhookService;
  let adminToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let contractId: number;
  let paymentId: number;
  let typeId: number;
  let subtypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    webhookService = app.get(PaymentWebhookService, { strict: false });
    await dropTenantSchema(dataSource, SLUG);
  });

  afterAll(async () => {
    await dropTenantSchema(dataSource, SLUG);
    await closeTestApp();
  });

  it('1. registra empresa y datos base', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Webhook Payments E2E',
        country: 'BO',
        name: 'Admin Webhook',
        email: 'admin@e2e-payment-webhook.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as { access_token?: string };
    adminToken = body.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. crea inquilino, propiedad, contrato y pago pendiente', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const tenantRes = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Webhook',
        email: 'tenant@e2e-payment-webhook.com',
        password: 'Tenant365Soft!',
        phone: '70000910',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    const propertyRes = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto webhook',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Webhook 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 950,
        currency: 'USD',
      })
      .expect(201);

    const propertyBody = propertyRes.body as { id?: number };
    propertyId = propertyBody.id ?? 0;

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const contractRows = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', 'CTR-E2E-010', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserId, propertyId, 950, 'USD', today, nextYear],
    );

    contractId = contractRows[0].id;

    const paymentRes = await request(httpServer)
      .post(`/${SLUG}/admin/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenant_id: tenantUserId,
        property_id: propertyId,
        contract_id: contractId,
        amount: 950,
        currency: 'USD',
        payment_type: 'RENT',
        payment_method: 'STRIPE',
        payment_processor: 'stripe',
        payment_date: today,
        reference_number: PAYMENT_REFERENCE,
      })
      .expect(201);

    const paymentBody = paymentRes.body as { id?: number; status?: string };
    paymentId = paymentBody.id ?? 0;
    expect(paymentBody.status).toBe('PENDING');
  });

  it('3. procesa el webhook una sola vez aunque el proveedor reintente', async () => {
    const schema = schemaNameFromSlug(SLUG);

    await webhookService.handleWebhookResult(
      SLUG,
      {
        event_id: WEBHOOK_EVENT_ID,
        transaction_id: PAYMENT_REFERENCE,
        status: 'APPROVED',
        raw_event: { id: WEBHOOK_EVENT_ID, source: 'e2e' },
      },
      'stripe',
    );

    await webhookService.handleWebhookResult(
      SLUG,
      {
        event_id: WEBHOOK_EVENT_ID,
        transaction_id: PAYMENT_REFERENCE,
        status: 'APPROVED',
        raw_event: { id: WEBHOOK_EVENT_ID, source: 'e2e-retry' },
      },
      'stripe',
    );

    const paymentRows = await dataSource.query<{ status: string }[]>(
      `SELECT status FROM "${schema}".payments WHERE id = $1`,
      [paymentId],
    );
    expect(paymentRows[0].status).toBe('APPROVED');

    const eventRows = await dataSource.query<{ total: string }[]>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".webhook_events
       WHERE event_id = $1`,
      [WEBHOOK_EVENT_ID],
    );
    expect(Number(eventRows[0].total)).toBe(1);
  });
});
