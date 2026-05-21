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
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-app-flow';
const schema = schemaNameFromSlug(SLUG);

interface AuthTokenBody {
  access_token?: string;
}

interface RegisteredUserBody {
  id?: number;
  role?: string;
}

interface IdBody {
  id?: number;
}

interface ApplicationStatusBody {
  status?: string;
}

interface ContractGeneratedBody {
  contract_generated?: {
    monthly_rent?: string | number;
  };
}

interface ContractListItem {
  property_id: number;
}

describe('E2E #2 — Application → contrato automático', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;
  let tenantToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let applicationId: number;
  let rollbackPropertyId: number;
  let rollbackApplicationId: number;
  let typeId: number;
  let subtypeId: number;

  beforeAll(async () => {
    app = await createTestApp();
    httpServer = app.getHttpServer() as Parameters<typeof request>[0];
    dataSource = app.get(DataSource);
    await dropTenantSchema(dataSource, SLUG);
  });

  afterAll(async () => {
    await dropTenantSchema(dataSource, SLUG);
    await closeTestApp();
  });

  it('1. registra la empresa y el admin', async () => {
    const res = await request(httpServer)
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

    const body = res.body as AuthTokenBody;
    adminToken = body.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. registra un inquilino en el tenant', async () => {
    const res = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Juan Inquilino',
        email: 'juan@inquilino.com',
        password: 'Inquilino365Ok!',
        phone: '70000001',
      })
      .expect(201);

    // register devuelve el usuario directamente (sin wrapper { user: ... })
    const body = res.body as RegisteredUserBody;
    expect(body.role).toBe('INQUILINO');
    tenantUserId = body.id ?? 0;
  });

  it('3. el inquilino hace login', async () => {
    const res = await request(httpServer)
      .post(`/auth/${SLUG}/login`)
      .send({ email: 'juan@inquilino.com', password: 'Inquilino365Ok!' })
      .expect(200);

    const body = res.body as AuthTokenBody;
    tenantToken = body.access_token ?? '';
  });

  it('4. el admin crea una propiedad disponible', async () => {
    const res = await request(httpServer)
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

    const body = res.body as IdBody;
    propertyId = body.id ?? 0;
    expect(propertyId).toBeDefined();
  });

  it('5. el inquilino envía una solicitud de alquiler', async () => {
    const res = await request(httpServer)
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

    const body = res.body as IdBody;
    applicationId = body.id ?? 0;
    expect(applicationId).toBeDefined();
  });

  it('6. el admin lista solicitudes y ve la del inquilino', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/applications`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const found = (res.body as { id: number }[]).find(
      (a) => a.id === applicationId,
    );
    expect(found).toBeDefined();
  });

  it('7. el admin pasa la solicitud a estado EN_REVISION (screening)', async () => {
    const res = await request(httpServer)
      .patch(`/${SLUG}/applications/${applicationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'EN_REVISION' })
      .expect(200);

    const responseBody = res.body as
      | ApplicationStatusBody
      | ApplicationStatusBody[];
    const updatedApplication = Array.isArray(responseBody)
      ? responseBody[0]
      : responseBody;
    expect(updatedApplication.status).toBe('EN_REVISION');
  });

  it('8. el admin aprueba la solicitud y el contrato se genera automáticamente', async () => {
    const today = new Date();
    const nextYear = new Date(today);
    nextYear.setFullYear(today.getFullYear() + 1);

    const res = await request(httpServer)
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

    const body = res.body as ContractGeneratedBody;
    expect(body.contract_generated).toBeDefined();
    expect(Number(body.contract_generated?.monthly_rent)).toBe(500);

    const [application] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status
       FROM "${schema}".rental_applications
       WHERE id = $1`,
      [applicationId],
    );
    expect(application.status).toBe('APROBADA');

    const [contractCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".contracts
       WHERE application_id = $1`,
      [applicationId],
    );
    expect(Number(contractCount.total)).toBe(1);
  });

  it('9. el contrato generado aparece en el listado de contratos', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/contracts`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const contracts = res.body as ContractListItem[];
    const found = contracts.find((c) => c.property_id === propertyId);
    expect(found).toBeDefined();
  });

  it('10. prepara una segunda solicitud para validar rollback transaccional', async () => {
    const propertyRes = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto Rollback Apps',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Rollback 456',
            city: 'Cochabamba',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 700,
        currency: 'BOB',
      })
      .expect(201);

    const propertyBody = propertyRes.body as IdBody;
    rollbackPropertyId = propertyBody.id ?? 0;

    const applicationRes = await request(httpServer)
      .post(`/${SLUG}/applications`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        property_id: rollbackPropertyId,
        personal_data: {
          full_name: 'Juan Inquilino',
          phone: '70000001',
          identity_document: 'CI-ROLLBACK-123',
          current_address: 'Calle Rollback 100',
        },
        employment_data: {
          employer_name: 'Empresa Rollback',
          position: 'QA',
          monthly_income: 3000,
          employment_duration: '3 años',
          employer_phone: '70000005',
        },
        rental_history: [],
        references: [],
      })
      .expect(201);

    const applicationBody = applicationRes.body as IdBody;
    rollbackApplicationId = applicationBody.id ?? 0;

    await request(httpServer)
      .patch(`/${SLUG}/applications/${rollbackApplicationId}/status`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ status: 'EN_REVISION' })
      .expect(200);

    await dataSource.query(
      `UPDATE "${schema}".contracts
       SET status = 'ACTIVO', updated_at = NOW()
       WHERE tenant_id = $1
         AND application_id = $2`,
      [tenantUserId, applicationId],
    );
  });

  it('11. si crear contrato falla, la aprobación hace rollback y no deja contrato parcial', async () => {
    await request(httpServer)
      .patch(`/${SLUG}/applications/${rollbackApplicationId}/approve`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        monthly_rent: 700,
        currency: 'BOB',
        admin_feedback: 'Debe fallar por contrato activo existente',
      })
      .expect(400);

    const [application] = await dataSource.query<Array<{ status: string }>>(
      `SELECT status
       FROM "${schema}".rental_applications
       WHERE id = $1`,
      [rollbackApplicationId],
    );
    expect(application.status).toBe('EN_REVISION');

    const [contractCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".contracts
       WHERE application_id = $1`,
      [rollbackApplicationId],
    );
    expect(Number(contractCount.total)).toBe(0);
  });
});
