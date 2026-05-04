/**
 * E2E #3 — Inquilino registra pago → admin aprueba → split payment calculado
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Registrar inquilino + propiedad + propietario
 *  3. Crear contrato activo
 *  4. Admin crea pago manual en nombre del inquilino
 *  5. Admin aprueba el pago
 *  6. Verificar que el pago queda APPROVED
 *  7. Verificar split payment y liquidación de propietario
 *  8. Admin consulta estadísticas de pagos — total incrementado
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

const SLUG = 'e2e-payments';

describe('E2E #3 — Pago manual → aprobación → split payment', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let propertyId: number;
  let tenantUserId: number;
  let contractId: number;
  let paymentId: number;
  let ownerId: number;
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
        company_name: 'Empresa Payments E2E',
        country: 'BO',
        name: 'Admin Payments',
        email: 'admin@e2e-payments.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    adminToken = res.body.access_token as string;
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. registra inquilino, crea propiedad y asigna propietario', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const tenantRes = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Pago',
        email: 'pago@inquilino.com',
        password: 'Inquilino365Ok!',
        phone: '70000010',
      })
      .expect(201);

    tenantUserId = tenantRes.body.id as number;

    const propRes = await request(app.getHttpServer())
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto para pago',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Pago 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 800,
        currency: 'USD',
      })
      .expect(201);

    propertyId = propRes.body.id as number;

    const ownerRows = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schema}".rental_owners
         (name, primary_email, phone_number, is_active, created_at, updated_at)
       VALUES ('Owner E2E', 'owner@e2e-payments.com', '70000099', true, NOW(), NOW())
       RETURNING id`,
    );

    ownerId = ownerRows[0].id;

    await dataSource.query(
      `INSERT INTO "${schema}".property_owners
         (property_id, rental_owner_id, ownership_percentage, is_primary, created_at)
       VALUES ($1, $2, 100, true, NOW())`,
      [propertyId, ownerId],
    );
  });

  it('3. crea un contrato activo directamente en la base de datos de test', async () => {
    const schema = schemaNameFromSlug(SLUG);
    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const rows = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', 'CTR-E2E-003', 5, NOW(), NOW())
        RETURNING id`,
      [tenantUserId, propertyId, 800, 'USD', today, nextYear],
    );

    contractId = rows[0].id;
    expect(contractId).toBeDefined();
  });

  it('4. el admin registra un pago manual en nombre del inquilino', async () => {
    const today = new Date().toISOString().split('T')[0];

    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/admin/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        tenant_id: tenantUserId,
        property_id: propertyId,
        contract_id: contractId,
        amount: 800,
        currency: 'USD',
        payment_type: 'RENT',
        payment_method: 'CASH',
        payment_date: today,
      })
      .expect(201);

    paymentId = res.body.id as number;
    expect(paymentId).toBeDefined();
    expect(res.body.status).toBe('PENDING');
  });

  it('5. el admin aprueba el pago', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/admin/payments/${paymentId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ admin_notes: 'Pago verificado en efectivo' })
      .expect(200);

    const approvedPayment = Array.isArray(res.body) ? res.body[0] : res.body;
    expect(approvedPayment.status).toBe('APPROVED');
    expect(approvedPayment.approved_at).not.toBeNull();
  });

  it('6. el pago aprobado aparece en el historial del tenant', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/admin/payments`)
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ status: 'APPROVED' })
      .expect(200);

    const payments = (res.body.payments ?? res.body) as {
      id: number;
      status: string;
    }[];
    const found = payments.find((p) => p.id === paymentId);
    expect(found).toBeDefined();
    expect(found?.status).toBe('APPROVED');
  });

  it('7. el split payment y la liquidación del propietario se generan', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const splits = await dataSource.query<{ id: number; amount: string }[]>(
      `SELECT id, amount
       FROM "${schema}".payment_splits
       WHERE payment_id = $1`,
      [paymentId],
    );
    expect(splits.length).toBeGreaterThan(0);

    const statements = await dataSource.query<
      { id: number; payment_count: number }[]
    >(
      `SELECT id, payment_count
       FROM "${schema}".owner_statements
       WHERE rental_owner_id = $1
         AND property_id = $2
       ORDER BY id DESC
       LIMIT 1`,
      [ownerId, propertyId],
    );
    expect(statements.length).toBeGreaterThan(0);
    expect(Number(statements[0].payment_count)).toBeGreaterThanOrEqual(1);
  });

  it('8. las estadísticas de pagos reflejan el pago aprobado', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/admin/payments/stats`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.total_payments).toBeGreaterThanOrEqual(1);
    expect(Number(res.body.total_amount_approved)).toBeGreaterThanOrEqual(800);
  });
});
