/**
 * E2E #15 - Reports con tenant poblado
 *
 * Valida con PostgreSQL real los reportes administrativos principales:
 * rent roll, vacancies, delinquency, PnL, KPIs y exportación Excel/PDF.
 */
import type { IncomingMessage } from 'http';
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

const SLUG = 'e2e-reports';

interface ReportPropertySeed {
  propertyId: number;
  unitId: number;
  contractId: number;
}

interface BinaryReportResponse {
  body: Buffer;
  headers: Record<string, string | string[] | undefined>;
}

const binaryParser = (
  res: IncomingMessage,
  callback: (error: Error | null, body: Buffer) => void,
): void => {
  const chunks: Buffer[] = [];

  res.on('data', (chunk: Buffer | string) => {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  });
  res.on('end', () => callback(null, Buffer.concat(chunks)));
  res.on('error', (error: Error) => callback(error, Buffer.alloc(0)));
};

describe('E2E #15 - Reports con tenant poblado', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let adminToken: string;
  let tenantUserId: number;
  let typeId: number;
  let subtypeId: number;
  let occupied: ReportPropertySeed;
  let vacant: ReportPropertySeed;
  let inactive: ReportPropertySeed;
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

  it('1. registra empresa y datos base de reportes', async () => {
    const adminRes = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa Reports E2E',
        country: 'BO',
        name: 'Admin Reports',
        email: 'admin@e2e-reports.com',
        password: 'Admin365Soft!',
      })
      .expect(201);

    const adminBody = adminRes.body as { access_token?: string };
    adminToken = adminBody.access_token ?? '';
    ({ typeId, subtypeId } = await seedPublicPropertyTypes(dataSource, SLUG));

    const tenantRes = await request(httpServer)
      .post(`/auth/${SLUG}/register`)
      .send({
        name: 'Inquilino Reports',
        email: 'tenant@e2e-reports.com',
        password: 'Tenant365Soft!',
        phone: '70001510',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    occupied = await seedPropertyWithUnit({
      title: 'Edificio Reports Ocupado',
      propertyStatus: 'OCUPADO',
      unitStatus: 'occupied',
      unitNumber: '101',
      contractStatus: 'ACTIVO',
      rent: 1000,
    });
    vacant = await seedPropertyWithUnit({
      title: 'Edificio Reports Vacante',
      propertyStatus: 'DISPONIBLE',
      unitStatus: 'available',
      unitNumber: '102',
      contractStatus: 'FINALIZADO',
      rent: 800,
    });
    inactive = await seedPropertyWithUnit({
      title: 'Edificio Reports Inactivo',
      propertyStatus: 'INACTIVO',
      unitStatus: 'occupied',
      unitNumber: '999',
      contractStatus: 'ACTIVO',
      rent: 9999,
    });

    await seedFinancialData();
  });

  it('2. rent roll muestra contratos/unidades activas y excluye inactivos', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/reports/rent-roll`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body as Array<{
      property_id: number;
      unit_id: number | null;
      tenant_name: string | null;
      current_balance: string | number;
    }>;
    const occupiedRow = rows.find(
      (row) => row.property_id === occupied.propertyId,
    );

    expect(occupiedRow).toBeDefined();
    expect(occupiedRow?.unit_id).toBe(occupied.unitId);
    expect(occupiedRow?.tenant_name).toBe('Inquilino Reports');
    expect(Number(occupiedRow?.current_balance)).toBe(400);
    expect(rows.some((row) => row.property_id === inactive.propertyId)).toBe(
      false,
    );
  });

  it('3. vacancies reporta unidades disponibles', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/reports/vacancies`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body as Array<{
      property_id: number;
      unit_id: number;
      unit_number: string;
      market_rent: string | number;
      days_vacant: string | number;
    }>;
    const vacancy = rows.find((row) => row.property_id === vacant.propertyId);

    expect(vacancy).toBeDefined();
    expect(vacancy?.unit_id).toBe(vacant.unitId);
    expect(vacancy?.unit_number).toBe('102');
    expect(Number(vacancy?.market_rent)).toBe(800);
    expect(Number(vacancy?.days_vacant)).toBeGreaterThanOrEqual(0);
  });

  it('4. delinquency muestra pagos vencidos no aprobados', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/reports/delinquency`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body as Array<{
      tenant_id: number;
      property_id: number;
      contract_id: number;
      total_owed: string | number;
      max_days_late: string | number;
    }>;

    expect(rows).toHaveLength(1);
    expect(rows[0].tenant_id).toBe(tenantUserId);
    expect(rows[0].property_id).toBe(occupied.propertyId);
    expect(rows[0].contract_id).toBe(occupied.contractId);
    expect(Number(rows[0].total_owed)).toBe(400);
    expect(Number(rows[0].max_days_late)).toBeGreaterThan(0);
  });

  it('5. PnL calcula ingresos, gastos y neto por propiedad', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/reports/pnl`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const rows = res.body as Array<{
      property_id: number;
      income: string | number;
      expenses: string | number;
      net_result: string | number;
    }>;
    const pnl = rows.find((row) => row.property_id === occupied.propertyId);

    expect(pnl).toBeDefined();
    expect(Number(pnl?.income)).toBe(1000);
    expect(Number(pnl?.expenses)).toBe(250);
    expect(Number(pnl?.net_result)).toBe(750);
    expect(rows.some((row) => row.property_id === inactive.propertyId)).toBe(
      false,
    );
  });

  it('6. KPIs agregan ocupación, ingresos, pagos pendientes y mantenimiento activo', async () => {
    const res = await request(httpServer)
      .get(`/${SLUG}/admin/reports/kpis`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body).toMatchObject({
      occupancyRate: '50.00%',
      totalUnits: 2,
      occupiedUnits: 1,
      monthlyIncome: 1000,
      pendingPaymentsCount: 1,
      activeMaintenanceCount: 1,
    });
  });

  it('7. exporta reportes a Excel y PDF desde el controller', async () => {
    const excelRes = (await request(httpServer)
      .get(`/${SLUG}/admin/reports/rent-roll`)
      .query({ format: 'excel' })
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as BinaryReportResponse;

    expect(excelRes.headers['content-type']).toContain(
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    expect(excelRes.headers['content-disposition']).toContain(
      'filename=Rent_Roll.xlsx',
    );
    expect(excelRes.body.subarray(0, 2).toString()).toBe('PK');

    const pdfRes = (await request(httpServer)
      .get(`/${SLUG}/admin/reports/kpis`)
      .query({ format: 'pdf' })
      .set('Authorization', `Bearer ${adminToken}`)
      .buffer(true)
      .parse(binaryParser)
      .expect(200)) as BinaryReportResponse;

    expect(pdfRes.headers['content-type']).toContain('application/pdf');
    expect(pdfRes.headers['content-disposition']).toContain(
      'filename=KPIs.pdf',
    );
    expect(pdfRes.body.subarray(0, 4).toString()).toBe('%PDF');
  });

  async function seedPropertyWithUnit(input: {
    title: string;
    propertyStatus: string;
    unitStatus: string;
    unitNumber: string;
    contractStatus: string;
    rent: number;
  }): Promise<ReportPropertySeed> {
    const contractEndOffsetDays =
      input.contractStatus === 'FINALIZADO' ? -10 : 300;
    const contractStartOffsetDays =
      input.contractStatus === 'FINALIZADO' ? -400 : -60;
    const contractStartDate = offsetDate(contractStartOffsetDays);
    const contractEndDate = offsetDate(contractEndOffsetDays);

    const [property] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".properties
         (title, property_type_id, property_subtype_id, status, monthly_rent,
          currency, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'BOB', NOW(), NOW())
       RETURNING id`,
      [input.title, typeId, subtypeId, input.propertyStatus, input.rent],
    );

    const [unit] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".units
         (property_id, unit_number, bedrooms, bathrooms, square_meters, status,
          rental_type, price_per_month, deposit_amount, created_at, updated_at)
       VALUES ($1, $2, 2, 1, 80, $3, 'LONG_TERM', $4, $5, CURRENT_DATE - INTERVAL '20 days', NOW())
       RETURNING id`,
      [property.id, input.unitNumber, input.unitStatus, input.rent, input.rent],
    );

    const [contract] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".contracts
         (tenant_id, property_id, unit_id, monthly_rent, deposit_amount,
          currency, start_date, end_date, status, contract_number, payment_day,
          created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4, 'BOB', $5, $6, $7, $8, 5, NOW(), NOW())
       RETURNING id`,
      [
        tenantUserId,
        property.id,
        unit.id,
        input.rent,
        contractStartDate,
        contractEndDate,
        input.contractStatus,
        `CTR-E2E-REPORTS-${input.unitNumber}`,
      ],
    );

    return {
      propertyId: property.id,
      unitId: unit.id,
      contractId: contract.id,
    };
  }

  function offsetDate(days: number): string {
    const date = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
    return date.toISOString().split('T')[0];
  }

  async function seedFinancialData(): Promise<void> {
    await dataSource.query(
      `INSERT INTO "${schema}".payments
         (tenant_id, contract_id, property_id, amount, currency, payment_type,
          payment_method, status, payment_date, due_date, approved_at, created_at, updated_at)
       VALUES
         ($1, $2, $3, 1000, 'BOB', 'RENT', 'CASH', 'APPROVED', CURRENT_DATE,
          CURRENT_DATE, NOW(), NOW(), NOW()),
         ($1, $2, $3, 400, 'BOB', 'RENT', 'CASH', 'PENDING',
          CURRENT_DATE - INTERVAL '10 days', CURRENT_DATE - INTERVAL '10 days', NULL, NOW(), NOW()),
         ($1, $4, $5, 9999, 'BOB', 'RENT', 'CASH', 'APPROVED', CURRENT_DATE,
          CURRENT_DATE, NOW(), NOW(), NOW())`,
      [
        tenantUserId,
        occupied.contractId,
        occupied.propertyId,
        inactive.contractId,
        inactive.propertyId,
      ],
    );

    await dataSource.query(
      `INSERT INTO "${schema}".expenses
         (property_id, unit_id, category, amount, currency, description, date,
          created_at, updated_at)
       VALUES ($1, $2, 'maintenance', 250, 'BOB', 'Reparación E2E',
               CURRENT_DATE, NOW(), NOW())`,
      [occupied.propertyId, occupied.unitId],
    );

    await dataSource.query(
      `INSERT INTO "${schema}".maintenance_requests
         (ticket_number, request_type, category, title, description,
          permission_to_enter, has_pets, status, priority, tenant_id,
          contract_id, property_id, current_stage, owner_authorized,
          created_at, updated_at)
       VALUES ('MNT-E2E-REPORTS-001', 'MAINTENANCE', 'PLOMERIA',
               'Mantenimiento reportes', 'Solicitud activa para KPIs',
               'YES', false, 'NEW', 'NORMAL', $1, $2, $3, 'SCHEDULED',
               false, NOW(), NOW())`,
      [tenantUserId, occupied.contractId, occupied.propertyId],
    );
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
  }
});
