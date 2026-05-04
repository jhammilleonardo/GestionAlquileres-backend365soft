/**
 * E2E #2 — Inquilino aplica → admin hace screening → aprueba → contrato generado
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Registrar inquilino (POST /auth/:slug/register)
 *  3. Login como inquilino
 *  4. Crear propiedad (como admin)
 *  5. Inquilino envía solicitud de alquiler
 *  6. Admin lista solicitudes — aparece la nueva
 *  7. Admin hace screening (PATCH /:slug/applications/:id/status → EN_REVISION)
 *  8. Admin aprueba → contrato creado automáticamente
 *  9. Verificar que el contrato existe en GET /:slug/admin/contracts
 */
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import {
  createTestApp,
  closeTestApp,
  dropTenantSchema,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-app-flow';

describe('E2E #2 — Application → contrato automático', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let tenantToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let applicationId: number;
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

  it('1. registra la empresa y el admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Application Flow',
        country: 'BO',
        name: 'Admin Apps',
        email: 'admin@e2e-apps.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    adminToken = res.body.access_token as string;
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. registra un inquilino en el tenant', async () => {
    const res = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Juan Inquilino',
        email: 'juan@inquilino.com',
        password: 'Inquilino365Ok!',
        phone: '70000001',
      })
      .expect(201);

    // register devuelve el usuario directamente (sin wrapper { user: ... })
    expect(res.body.role).toBe('INQUILINO');
    tenantUserId = res.body.id as number;
  });

  it('3. el inquilino hace login', async () => {
    const res = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/login`)
      .send({ email: 'juan@inquilino.com', password: 'Inquilino365Ok!' })
      .expect(200);

    tenantToken = res.body.access_token as string;
  });

  it('4. el admin crea una propiedad disponible', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto 101',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Calle Falsa 123',
            city: 'Cochabamba',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 500,
        currency: 'USD',
      })
      .expect(201);

    propertyId = res.body.id as number;
    expect(propertyId).toBeDefined();
  });

  it('5. el inquilino envía una solicitud de alquiler', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/applications`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        property_id: propertyId,
        personal_data: {
          full_name: 'Juan Inquilino',
          phone: '70000001',
          identity_document: 'CI-123456',
          current_address: 'Calle Vieja 456',
        },
        employment_data: {
          employer_name: 'Empresa SA',
          position: 'Desarrollador',
          monthly_income: 2000,
          employment_duration: '2 años',
          employer_phone: '70000002',
        },
        rental_history: [
          {
            previous_address: 'Av. Anterior 789',
            previous_landlord_name: 'Don Carlos',
            previous_landlord_phone: '70000003',
            reason_for_leaving: 'Cambio de trabajo',
            previous_rent_amount: 400,
          },
        ],
        references: [
          {
            name: 'María Referencia',
            relationship: 'Amiga',
            phone: '70000004',
          },
        ],
      })
      .expect(201);

    applicationId = res.body.id as number;
    expect(applicationId).toBeDefined();
  });

  it('6. el admin lista solicitudes y ve la del inquilino', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/applications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (res.body as { id: number }[]).find(
      (a) => a.id === applicationId,
    );
    expect(found).toBeDefined();
  });

  it('7. el admin pasa la solicitud a estado EN_REVISION (screening)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'EN_REVISION' })
      .expect(200);

    const updatedApplication = Array.isArray(res.body) ? res.body[0] : res.body;
    expect(updatedApplication.status).toBe('EN_REVISION');
  });

  it('8. el admin aprueba la solicitud y el contrato se genera automáticamente', async () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);

    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/applications/${applicationId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        monthly_rent: 500,
        currency: 'USD',
        start_date: today.toISOString().split('T')[0],
        end_date: nextYear.toISOString().split('T')[0],
        admin_feedback: 'Todo en orden',
      })
      .expect(200);

    expect(res.body.application?.status).toBe('APROBADA');
    expect(res.body.contract_generated).toBeDefined();
    expect(Number(res.body.contract_generated.monthly_rent)).toBe(500);
  });

  it('9. el contrato generado aparece en el listado de contratos', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/admin/contracts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const contracts = res.body as { property_id: number }[];
    const found = contracts.find((c) => c.property_id === propertyId);
    expect(found).toBeDefined();
  });
});
