/**
 * E2E #9 — Rollback transaccional de propiedades
 *
 * Flujo:
 *  1. Registrar tenant + admin
 *  2. Intentar crear propiedad con owner inexistente y verificar rollback total
 *  3. Crear propiedad válida
 *  4. Intentar update con direcciones inválidas y verificar rollback de título/direcciones
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

const SLUG = 'e2e-properties-rollback';
const ADMIN_EMAIL = 'admin@e2e-properties-rollback.com';

describe('E2E #9 — Properties transaction rollback', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;
  let typeId: number;
  let subtypeId: number;
  let propertyId: number;
  const schemaName = schemaNameFromSlug(SLUG);

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

  it('1. registra tenant + admin', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Properties Rollback E2E',
        country: 'BO',
        name: 'Admin Properties Rollback',
        email: ADMIN_EMAIL,
        password: 'Admin365Soft!',
      })
      .expect(201);

    const body = res.body as { access_token?: string };
    adminToken = body.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));
  });

  it('2. rollback en create si falla asociar owner existente', async () => {
    const failedTitle = `Rollback Create ${Date.now()}`;

    await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: failedTitle,
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 1000,
        currency: 'BOB',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Rollback Create 100',
            city: 'Santa Cruz',
            country: 'Bolivia',
          },
        ],
        existing_owners: [
          {
            rental_owner_id: 999999,
            ownership_percentage: 100,
            is_primary: true,
          },
        ],
      })
      .expect(404);

    const [row] = await dataSource.query<Array<{ count: string }>>(
      `SELECT COUNT(*)::text AS count
       FROM "${schemaName}".properties
       WHERE title = $1`,
      [failedTitle],
    );

    expect(Number(row.count)).toBe(0);
  });

  it('3. crea propiedad válida para probar rollback de update', async () => {
    const res = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Rollback Update Original',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        monthly_rent: 1200,
        currency: 'BOB',
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Original 200',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
      })
      .expect(201);

    const body = res.body as { id?: number };
    propertyId = body.id ?? 0;
    expect(propertyId).toBeGreaterThan(0);
  });

  it('4. rollback en update si falla reemplazar direcciones', async () => {
    const failedTitle = 'Rollback Update Should Not Persist';

    const res = await request(httpServer)
      .patch(`/${SLUG}/admin/properties/${propertyId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: failedTitle,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. Temporal 300',
            city: 'La Paz',
            country: 'Bolivia',
          },
          {
            address_type: 'invalid_type',
            street_address: 'Direccion invalida',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
      });

    expect([400, 500]).toContain(res.status);

    const [propertyRow] = await dataSource.query<
      Array<{ title: string; address_count: string }>
    >(
      `SELECT p.title, COUNT(pa.id)::text AS address_count
       FROM "${schemaName}".properties p
       LEFT JOIN "${schemaName}".property_addresses pa ON pa.property_id = p.id
       WHERE p.id = $1
       GROUP BY p.id`,
      [propertyId],
    );

    expect(propertyRow.title).toBe('Rollback Update Original');
    expect(Number(propertyRow.address_count)).toBe(1);

    const [addressRow] = await dataSource.query<
      Array<{ street_address: string }>
    >(
      `SELECT street_address
       FROM "${schemaName}".property_addresses
       WHERE property_id = $1
       ORDER BY id ASC
       LIMIT 1`,
      [propertyId],
    );

    expect(addressRow.street_address).toBe('Av. Original 200');
  });

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
