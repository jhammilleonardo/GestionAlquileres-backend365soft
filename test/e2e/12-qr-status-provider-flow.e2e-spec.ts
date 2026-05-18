/**
 * E2E #12 - Verificacion QR con proveedor simulado
 *
 * Valida el flujo completo sin llamar a MC4 real:
 *  1. QR pendiente en base de datos.
 *  2. El proveedor simulado responde PAGADO.
 *  3. verificarEstadoQr actualiza QR y crea payment.
 *  4. Un segundo reintento no duplica payments.
 */
import { INestApplication, InternalServerErrorException } from '@nestjs/common';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { QrPaymentPersistenceService } from '../../src/payments/qr/qr-payment-persistence.service';
import { QrPaymentService } from '../../src/payments/qr/qr-payment.service';
import { QR_ESTADO } from '../../src/payments/qr/qr-payment.constants';
import { QrProviderService } from '../../src/payments/qr/qr-provider.service';
import {
  closeTestApp,
  createTestApp,
  dropTenantSchema,
  schemaNameFromSlug,
  seedPublicPropertyTypes,
} from '../helpers/app.factory';

const SLUG = 'e2e-qr-provider-flow';
const QR_ALIAS = 'QR365T1T20260518101000abcdef12';
const QR_PENDING_ALIAS = 'QR365T1T20260518102000abcdef13';
const QR_REJECTED_ALIAS = 'QR365T1T20260518103000abcdef14';
const QR_THROWN_ALIAS = 'QR365T1T20260518104000abcdef15';
const PAYMENT_REFERENCE = `QR-${QR_ALIAS}`;

describe('E2E #12 - QR provider status flow', () => {
  let app: INestApplication;
  let httpServer: Parameters<typeof request>[0];
  let dataSource: DataSource;
  let qrPersistenceService: QrPaymentPersistenceService;
  let qrPaymentService: QrPaymentService;
  let qrProviderService: QrProviderService;
  let adminToken: string;
  let tenantUserId: number;
  let propertyId: number;
  let contractId: number;
  let qrId: number;
  let pendingQrId: number;
  let rejectedQrId: number;
  let thrownQrId: number;
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
    qrPaymentService = app.get(QrPaymentService, { strict: false });
    qrProviderService = app.get(QrProviderService, { strict: false });
    await cleanup();
  });

  afterAll(async () => {
    jest.restoreAllMocks();
    await cleanup();
    await closeTestApp();
  });

  it('1. registra empresa y datos base', async () => {
    const res = await request(httpServer)
      .post('/auth/register-admin')
      .send({
        slug: SLUG,
        company_name: 'Empresa QR Provider Flow E2E',
        country: 'BO',
        name: 'Admin QR Provider',
        email: 'admin@e2e-qr-provider-flow.com',
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
        name: 'Inquilino QR Provider',
        email: 'tenant@e2e-qr-provider-flow.com',
        password: 'Tenant365Soft!',
        phone: '70001210',
      })
      .expect(201);

    const tenantBody = tenantRes.body as { id?: number };
    tenantUserId = tenantBody.id ?? 0;

    const propertyRes = await request(httpServer)
      .post(`/${SLUG}/admin/properties`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Depto QR Provider',
        property_type_id: typeId,
        property_subtype_id: subtypeId,
        addresses: [
          {
            address_type: 'address_1',
            street_address: 'Av. QR Provider 100',
            city: 'La Paz',
            country: 'Bolivia',
          },
        ],
        monthly_rent: 1250,
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
       VALUES ($1, $2, $3, $4, $5, $6, 'ACTIVO', 'CTR-E2E-012', 5, NOW(), NOW())
       RETURNING id`,
      [tenantUserId, propertyId, 1250, 'BOB', today, nextYear],
    );

    contractId = contractRows[0].id;

    qrId = await insertPendingQr(QR_ALIAS, 1250);
    pendingQrId = await insertPendingQr(QR_PENDING_ALIAS, 980);
    rejectedQrId = await insertPendingQr(QR_REJECTED_ALIAS, 990);
    thrownQrId = await insertPendingQr(QR_THROWN_ALIAS, 1000);
    expect(qrId).toBeGreaterThan(0);
    expect(pendingQrId).toBeGreaterThan(0);
    expect(rejectedQrId).toBeGreaterThan(0);
    expect(thrownQrId).toBeGreaterThan(0);
  });

  it('3. verifica estado PAGADO desde proveedor simulado y no duplica en reintento', async () => {
    const consultarEstadoSpy = jest
      .spyOn(qrProviderService, 'consultarEstado')
      .mockResolvedValue({
        codigo: '0000',
        mensaje: 'OK',
        objeto: { estadoActual: QR_ESTADO.PAGADO },
      });

    const firstResult = await qrPaymentService.verificarEstadoQr(
      SLUG,
      { qr_id: qrId },
      tenantUserId,
    );
    const secondResult = await qrPaymentService.verificarEstadoQr(
      SLUG,
      { qr_id: qrId },
      tenantUserId,
    );

    expect(firstResult.status).toBe(QR_ESTADO.PAGADO);
    expect(secondResult.status).toBe(QR_ESTADO.PAGADO);
    expect(consultarEstadoSpy).toHaveBeenCalledTimes(2);
    expect(consultarEstadoSpy).toHaveBeenCalledWith(QR_ALIAS);

    const [paymentCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".payments
       WHERE reference_number = $1`,
      [PAYMENT_REFERENCE],
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
      [PAYMENT_REFERENCE],
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

    expect(qrRow.estado).toBe(QR_ESTADO.PAGADO);
    expect(qrRow.pago_id).toBe(paymentRow.id);
  });

  it('4. mantiene QR pendiente cuando proveedor responde PENDIENTE y no crea payment', async () => {
    jest.spyOn(qrProviderService, 'consultarEstado').mockResolvedValueOnce({
      codigo: '0000',
      mensaje: 'OK',
      objeto: { estadoActual: QR_ESTADO.PENDIENTE },
    });

    const result = await qrPaymentService.verificarEstadoQr(
      SLUG,
      { qr_id: pendingQrId },
      tenantUserId,
    );

    expect(result.status).toBe(QR_ESTADO.PENDIENTE);
    await expectQrWithoutPayment(pendingQrId, QR_PENDING_ALIAS);
  });

  it('5. conserva estado y pagos cuando proveedor responde código no exitoso', async () => {
    jest.spyOn(qrProviderService, 'consultarEstado').mockResolvedValueOnce({
      codigo: '4040',
      mensaje: 'Alias no encontrado en proveedor',
    });

    const result = (await qrPaymentService.verificarEstadoQr(
      SLUG,
      { qr_id: rejectedQrId },
      tenantUserId,
    )) as {
      success: boolean;
      status: string;
      message: string;
    };

    expect(result.success).toBe(false);
    expect(result.status).toBe(QR_ESTADO.PENDIENTE);
    expect(result.message).toContain('Alias no encontrado en proveedor');
    await expectQrWithoutPayment(rejectedQrId, QR_REJECTED_ALIAS);
  });

  it('6. no muta QR ni crea payment si proveedor falla por transporte', async () => {
    jest
      .spyOn(qrProviderService, 'consultarEstado')
      .mockRejectedValueOnce(
        new InternalServerErrorException('Error al consultar estado del QR'),
      );

    await expect(
      qrPaymentService.verificarEstadoQr(
        SLUG,
        { qr_id: thrownQrId },
        tenantUserId,
      ),
    ).rejects.toBeInstanceOf(InternalServerErrorException);

    await expectQrWithoutPayment(thrownQrId, QR_THROWN_ALIAS);
  });

  async function insertPendingQr(
    alias: string,
    amount: number,
  ): Promise<number> {
    const [qr] = await dataSource.query<Array<{ id: number }>>(
      `INSERT INTO "${schema}".qr_payments
         (alias, estado, tenant_id, contract_id, monto, currency, payment_type,
          detalle_glosa, fecha_vencimiento, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'BOB', 'RENT',
               'Alquiler QR Provider E2E', NOW() + INTERVAL '1 day', NOW(), NOW())
       RETURNING id`,
      [alias, QR_ESTADO.PENDIENTE, tenantUserId, contractId, amount],
    );

    return qr.id;
  }

  async function expectQrWithoutPayment(
    targetQrId: number,
    alias: string,
  ): Promise<void> {
    const [qrRow] = await dataSource.query<
      Array<{ estado: string; pago_id: number | null }>
    >(
      `SELECT estado, pago_id
       FROM "${schema}".qr_payments
       WHERE id = $1`,
      [targetQrId],
    );

    expect(qrRow.estado).toBe(QR_ESTADO.PENDIENTE);
    expect(qrRow.pago_id).toBeNull();

    const [paymentCount] = await dataSource.query<Array<{ total: string }>>(
      `SELECT COUNT(*)::text AS total
       FROM "${schema}".payments
       WHERE reference_number = $1`,
      [`QR-${alias}`],
    );
    expect(Number(paymentCount.total)).toBe(0);
  }

  async function cleanup(): Promise<void> {
    if (!dataSource) {
      return;
    }

    await dropTenantSchema(dataSource, SLUG);
  }
});
