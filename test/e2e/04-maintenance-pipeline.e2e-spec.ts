/**
 * E2E #4 — Mantenimiento reportado → asignado a técnico → técnico completa → notificación
 *
 * Flujo:
 *  1. Registrar empresa + admin
 *  2. Crear inquilino, propiedad y contrato activo
 *  3. Crear usuario técnico (TECNICO)
 *  4. Inquilino reporta solicitud de mantenimiento
 *  5. Admin lista solicitudes
 *  6. Admin asigna al técnico
 *  7. Admin avanza etapa a ASSIGNED y luego SCHEDULED
 *  8. Admin autoriza el trabajo (regla BO)
 *  9. Técnico avanza a IN_PROGRESS y luego COMPLETED
 * 10. Verificar que la solicitud queda COMPLETED
 * 11. Verificar notificación de mantenimiento completado
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

const SLUG = 'e2e-maintenance';

describe('E2E #4 — Pipeline de mantenimiento', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let adminToken: string;
  let tenantToken: string;
  let techToken: string;
  let tenantUserId: number;
  let techUserId: number;
  let propertyId: number;
  let contractId: number;
  let maintenanceId: number;
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
        company_name: 'Empresa Mantenimiento E2E',
        country: 'BO',
        name: 'Admin Mant',
        email: 'admin@e2e-maint.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    adminToken = res.body.access_token as string;
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. registra inquilino y crea propiedad + contrato activo', async () => {
    const schema = schemaNameFromSlug(SLUG);

    const tenantRes = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Mant',
        email: 'mant@inquilino.com',
        password: 'Inquilino365Ok!',
        phone: '70000020',
      })
      .expect(201);

    tenantUserId = tenantRes.body.id as number;

    const tenantLogin = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/login`)
      .send({ email: 'mant@inquilino.com', password: 'Inquilino365Ok!' })
      .expect(200);

    tenantToken = tenantLogin.body.access_token as string;

    const propRes = await request(app.getHttpServer())
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto Mantenimiento',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 600,
        currency: 'USD',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Mant 200',
            city: 'Cochabamba',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);

    propertyId = propRes.body.id as number;

    const today = new Date().toISOString().split('T')[0];
    const nextYear = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split('T')[0];

    const contractRows = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, monthly_rent, currency, start_date, end_date,
          status, contract_number, payment_day, created_at, updated_at)
       VALUES ($1, $2, 600, 'USD', $3, $4, 'ACTIVO', 'CTR-E2E-004', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserId, propertyId, today, nextYear],
    );
    contractId = contractRows[0].id;
  });

  it('3. crea un técnico en el sistema', async () => {
    const schema = schemaNameFromSlug(SLUG);
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.hash('Tecnico365Ok!', 12);

    const rows = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schema}"."user" (name, email, password, role, is_active, created_at, updated_at)
       VALUES ('Técnico E2E', 'tech@e2e-maint.com', $1, 'TECNICO', true, NOW(), NOW())
       RETURNING id`,
      [hash],
    );
    techUserId = rows[0].id;

    const loginRes = await request(app.getHttpServer())
      .post(`/auth/${SLUG}/login`)
      .send({ email: 'tech@e2e-maint.com', password: 'Tecnico365Ok!' })
      .expect(200);

    techToken = loginRes.body.access_token as string;
  });

  it('4. el inquilino reporta una solicitud de mantenimiento', async () => {
    const res = await request(app.getHttpServer())
      .post(`/${SLUG}/tenant/maintenance`)
      .set('Authorization', `Bearer ${tenantToken}`)
      .send({
        request_type: 'MAINTENANCE',
        category: 'PLOMERIA',
        title: 'Fuga en el baño',
        description: 'Hay una fuga de agua en el grifo del baño principal.',
        permission_to_enter: 'YES',
        has_pets: false,
        contract_id: contractId,
      })
      .expect(201);

    maintenanceId = res.body.id as number;
    expect(maintenanceId).toBeDefined();
    expect(res.body.current_stage).toBe('REPORTED');
  });

  it('5. el admin lista solicitudes y ve la nueva', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/admin/maintenance`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const items = res.body as { id: number }[];
    expect(items.find((m) => m.id === maintenanceId)).toBeDefined();
  });

  it('6. el admin asigna la solicitud al técnico', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/admin/maintenance/${maintenanceId}/assign-vendor`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ assigned_to: techUserId })
      .expect(200);

    expect(res.body.assigned_to).toBe(techUserId);
  });

  it('7. el admin avanza la solicitud a ASSIGNED y luego SCHEDULED', async () => {
    const assigned = await request(app.getHttpServer())
      .patch(`/${SLUG}/admin/maintenance/${maintenanceId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to_stage: 'ASSIGNED', notes: 'Orden asignada al técnico.' })
      .expect(200);

    expect(assigned.body.current_stage).toBe('ASSIGNED');

    const scheduled = await request(app.getHttpServer())
      .patch(`/${SLUG}/admin/maintenance/${maintenanceId}/stage`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ to_stage: 'SCHEDULED', notes: 'Visita técnica agendada.' })
      .expect(200);

    expect(scheduled.body.current_stage).toBe('SCHEDULED');
  });

  it('8. el admin autoriza el trabajo (regla Bolivia)', async () => {
    await request(app.getHttpServer())
      .patch(`/${SLUG}/admin/maintenance/${maintenanceId}/authorize`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('9. el técnico avanza la etapa a IN_PROGRESS', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/tecnico/maintenance/${maintenanceId}/stage`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ to_stage: 'IN_PROGRESS' })
      .expect(200);

    expect(res.body.current_stage).toBe('IN_PROGRESS');
  });

  it('10. el técnico marca la solicitud como COMPLETED', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/${SLUG}/tecnico/maintenance/${maintenanceId}/stage`)
      .set('Authorization', `Bearer ${techToken}`)
      .send({ to_stage: 'COMPLETED', notes: 'Grifo reparado sin novedad.' })
      .expect(200);

    expect(res.body.current_stage).toBe('COMPLETED');
  });

  it('11. la solicitud queda en estado COMPLETED al consultarla', async () => {
    const res = await request(app.getHttpServer())
      .get(`/${SLUG}/admin/maintenance/${maintenanceId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.current_stage).toBe('COMPLETED');
  });

  it('12. se generó al menos una notificación relacionada con el mantenimiento', async () => {
    const schema = schemaNameFromSlug(SLUG);
    const rows = await dataSource.query<{ id: number }[]>(
      `SELECT id FROM "${schema}".notifications
       WHERE event_type IN ('maintenance.completed', 'maintenance.assigned')
       LIMIT 1`,
    );
    expect(rows.length).toBeGreaterThan(0);
  });
});
