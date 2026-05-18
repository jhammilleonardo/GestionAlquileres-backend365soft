/**
 * E2E #11 - Procesamiento QR idempotente
 *
 * Valida que procesar dos veces el mismo QR pagado:
 *  1. Crea un solo registro en payments.
 *  2. Enlaza qr_payments.pago_id al pago creado.
 *  3. Usa enums estándar del módulo de pagos.
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { QrPaymentPersistenceService } from '../../src/payments/qr/qr-payment-persistence.service';
import { QrPaymentProcessingService } from '../../src/payments/qr/qr-payment-processing.service';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-qr-idempotency';
const QR_ALIAS = 'QR365T1T20260518080500abcdef12';

describe('E2E #11 - QR payment processing idempotency', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let qrPersistenceService: QrPaymentPersistenceService;
  let qrProcessingService: QrPaymentProcessingService;
  let adminToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let contractId: number;
  let qrId: number;
  let typeId: number;
  let subtypeId: number;
  const schema = schemaNameFromSlug(SLUG);

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    qrPersistenceService = app.get(QrPaymentPersistenceService, {
      strict: false,
    });
    qrProcessingService = app.get(QrPaymentProcessingService, {
      strict: false,
    });
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
        company_name: 'Empresa QR Idempotency E2E',
        country: 'BO',
        name: 'Admin QR',
        email: 'admin@e2e-qr-idempotency.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as { access_token?: string };
    adminToken = body.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
    await qrPersistenceService.ensureQrTable(schema);
  });

  it('2. crea inquilino, propiedad, contrato y QR pendiente', async () => {
    const tenantRes = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino QR',
        email: 'tenant@e2e-qr-idempotency.com',
        password: 'Tenant365Soft!',
        phone: '70001110',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    const propertyRes = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto QR',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. QR 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 1100,
        currency: 'BOB',
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
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', 'CTR-E2E-011', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserId, propertyId, 1100, 'BOB', today, nextYear],
    );

    contractId = contractRows[0].id;

    const qrRows = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".qr_payments
         (alias, estado, tenant_id, contract_id, monto, currency, payment_type,
          detalle_glosa, fecha_vencimiento, created_at, updated_at)
       VALUES ($1, 'PENDIENTE', $2, $3, 1100, 'BOB', 'RENT',
               'Alquiler QR E2E', NOW() + INTERVAL '1 day', NOW(), NOW())
       RETURNING id`,
      [QR_ALIAS, tenantUserId, contractId],
    );

    qrId = qrRows[0].id;
    expect(qrId).toBeGreaterThan(0);
  });

  it('3. procesa el mismo QR dos veces sin duplicar payments', async () => {
    const qrRows = await dataSource.query<
      Array<{
        id: number;
        tenant_id: number;
        contract_id: number;
        pago_id: number | null;
        monto: string;
        alias: string;
        detalle_glosa: string;
      }>
    >(
      `SELECT id, tenant_id, contract_id, pago_id, monto, alias, detalle_glosa
       FROM "${schema}".qr_payments
       WHERE id = $1`,
      [qrId],
    );

    const firstResult = await qrProcessingService.procesarPagoQr(
      schema,
      qrRows[0],
    );
    const secondResult = await qrProcessingService.procesarPagoQr(
      schema,
      qrRows[0],
    );

    expect(firstResult.payment_id).toBeGreaterThan(0);
    expect(secondResult.payment_id).toBe(firstResult.payment_id);

    const [paymentCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".payments
       WHERE reference_number = $1`,
      [`QR-${QR_ALIAS}`],
    );
    expect(Number(paymentCount.total)).toBe(1);

    const [paymentRow] = await dataSource.query<
      Array<{
        id: number;
        status: string;
        payment_type: string;
        payment_method: string;
        payment_processor: string;
      }>
    >(
      `SELECT id, status, payment_type, payment_method, payment_processor
       FROM "${schema}".payments
       WHERE reference_number = $1`,
      [`QR-${QR_ALIAS}`],
    );

    expect(paymentRow.status).toBe('APPROVED');
    expect(paymentRow.payment_type).toBe('RENT');
    expect(paymentRow.payment_method).toBe('QR_MC4');
    expect(paymentRow.payment_processor).toBe('mc4_qr');

    const [qrRow] = await dataSource.query<
      Array<{ estado: string; pago_id: number }>
    >(
      `SELECT estado, pago_id
       FROM "${schema}".qr_payments
       WHERE id = $1`,
      [qrId],
    );

    expect(qrRow.estado).toBe('PAGADO');
    expect(qrRow.pago_id).toBe(paymentRow.id);
  });

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
  }
});
