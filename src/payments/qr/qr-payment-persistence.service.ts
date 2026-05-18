import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../../common/utils/sql-identifier';
import { GenerateQrDto } from './dto';
import { QR_ESTADO } from './qr-payment.constants';
import { Mc4QrObject } from './qr-provider.service';

interface TenantUserRow {
  id: number;
  name?: string | null;
}

export interface QrPaymentDbRow {
  id: number;
  alias: string;
  estado: string;
  tenant_id: number;
  contract_id?: number | null;
  pago_id?: number | null;
  monto: string | number;
  currency?: string | null;
  payment_type?: string | null;
  detalle_glosa?: string | null;
  imagen_qr?: string | Record<string, unknown> | null;
  fecha_vencimiento: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

export interface MappedQrPayment {
  id: number;
  tenant_id: number;
  contract_id: number | null;
  amount: number;
  currency: string;
  payment_type: string;
  status: string;
  qr_image: string | null;
  notes: string | null;
  expires_at: string | Date;
  created_at: string | Date;
  updated_at: string | Date;
}

interface CreatePendingQrParams {
  alias: string;
  detalleGlosa: string;
  imagenQr: Mc4QrObject | null;
  fechaVencimiento: Date;
  dto: GenerateQrDto;
}

@Injectable()
export class QrPaymentPersistenceService {
  private readonly initializedSchemas = new Set<string>();

  constructor(private readonly dataSource: DataSource) {}

  async ensureQrTable(schemaName: string): Promise<void> {
    if (this.initializedSchemas.has(schemaName)) return;

    const schema = quoteIdent(schemaName);

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schema}.qr_payments (
        id           SERIAL PRIMARY KEY,
        alias        VARCHAR(80)    NOT NULL UNIQUE,
        estado       VARCHAR(20)    NOT NULL DEFAULT '${QR_ESTADO.PENDIENTE}',
        tenant_id    INTEGER        NOT NULL,
        contract_id  INTEGER,
        pago_id      INTEGER,
        monto        DECIMAL(12,2)  NOT NULL,
        currency     VARCHAR(10)    NOT NULL DEFAULT 'BOB',
        payment_type VARCHAR(30)    NOT NULL DEFAULT 'RENT',
        detalle_glosa VARCHAR(255),
        imagen_qr    TEXT,
        fecha_vencimiento TIMESTAMP NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.dataSource.query(`
      ALTER TABLE ${schema}.qr_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BOB';
      ALTER TABLE ${schema}.qr_payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) NOT NULL DEFAULT 'RENT';
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_ALIAS
        ON ${schema}.qr_payments(alias);
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_TENANT
        ON ${schema}.qr_payments(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_ESTADO
        ON ${schema}.qr_payments(estado);
    `);

    this.initializedSchemas.add(schemaName);
  }

  async findTenantUser(
    schemaName: string,
    tenantId: number,
  ): Promise<TenantUserRow | null> {
    const rows = await this.dataSource.query<TenantUserRow[]>(
      `SELECT id, name FROM ${quoteIdent(schemaName)}."user" WHERE id = $1 LIMIT 1`,
      [tenantId],
    );

    return rows[0] ?? null;
  }

  async contractBelongsToTenant(
    schemaName: string,
    contractId: number,
    tenantId: number,
  ): Promise<boolean> {
    const rows = await this.dataSource.query<{ id: number }[]>(
      `SELECT id FROM ${quoteIdent(schemaName)}.contracts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
      [contractId, tenantId],
    );

    return rows.length > 0;
  }

  async createPendingQr(
    schemaName: string,
    params: CreatePendingQrParams,
  ): Promise<MappedQrPayment> {
    const rows = await this.dataSource.query<QrPaymentDbRow[]>(
      `INSERT INTO ${quoteIdent(schemaName)}.qr_payments
         (alias, estado, tenant_id, contract_id, monto, currency, payment_type, detalle_glosa, imagen_qr, fecha_vencimiento, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        params.alias,
        QR_ESTADO.PENDIENTE,
        params.dto.tenant_id,
        params.dto.contract_id ?? null,
        params.dto.amount,
        params.dto.currency ?? 'BOB',
        params.dto.payment_type ?? 'RENT',
        params.detalleGlosa,
        params.imagenQr ? JSON.stringify(params.imagenQr) : null,
        params.fechaVencimiento,
      ],
    );

    return this.mapQrRecord(rows[0], params.dto);
  }

  async findById(
    schemaName: string,
    qrId: number,
  ): Promise<QrPaymentDbRow | null> {
    const rows = await this.dataSource.query<QrPaymentDbRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.qr_payments WHERE id = $1 LIMIT 1`,
      [qrId],
    );

    return rows[0] ?? null;
  }

  async findByAlias(
    schemaName: string,
    alias: string,
  ): Promise<QrPaymentDbRow | null> {
    const rows = await this.dataSource.query<QrPaymentDbRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.qr_payments WHERE alias = $1 LIMIT 1`,
      [alias],
    );

    return rows[0] ?? null;
  }

  async findByIdOrFail(
    schemaName: string,
    qrId: number,
  ): Promise<QrPaymentDbRow> {
    const qr = await this.findById(schemaName, qrId);
    if (!qr) {
      throw new NotFoundException(`QR con id ${qrId} no encontrado`);
    }

    return qr;
  }

  async updateEstadoAndRefresh(
    schemaName: string,
    qrId: number,
    estado: string,
  ): Promise<QrPaymentDbRow> {
    await this.dataSource.query(
      `UPDATE ${quoteIdent(schemaName)}.qr_payments
       SET estado = $1, updated_at = NOW()
       WHERE id = $2`,
      [estado, qrId],
    );

    return this.findByIdOrFail(schemaName, qrId);
  }

  async cancelQr(
    schemaName: string,
    qrId: number,
    tenantId?: number,
  ): Promise<MappedQrPayment> {
    const qr = await this.findByIdOrFail(schemaName, qrId);
    this.assertTenantOwnership(qr, tenantId, 'cancelar');

    if (qr.estado === QR_ESTADO.PAGADO) {
      throw new BadRequestException(
        'No se puede cancelar un QR que ya ha sido pagado',
      );
    }

    const updated = await this.updateEstadoAndRefresh(
      schemaName,
      qrId,
      QR_ESTADO.CANCELADO,
    );

    return this.mapQrRecord(updated);
  }

  async listQrs(
    schemaName: string,
    tenantId?: number,
  ): Promise<QrPaymentDbRow[]> {
    if (tenantId) {
      return this.dataSource.query<QrPaymentDbRow[]>(
        `SELECT * FROM ${quoteIdent(schemaName)}.qr_payments WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );
    }

    return this.dataSource.query<QrPaymentDbRow[]>(
      `SELECT * FROM ${quoteIdent(schemaName)}.qr_payments ORDER BY created_at DESC`,
    );
  }

  async listMappedQrs(
    schemaName: string,
    tenantId: number,
  ): Promise<MappedQrPayment[]> {
    const rows = await this.listQrs(schemaName, tenantId);
    return rows.map((row) => this.mapQrRecord(row));
  }

  mapQrRecord(
    qr: QrPaymentDbRow,
    dto?: Partial<GenerateQrDto>,
  ): MappedQrPayment {
    return {
      id: qr.id,
      tenant_id: qr.tenant_id,
      contract_id: qr.contract_id ?? null,
      amount: Number(qr.monto),
      currency: qr.currency ?? dto?.currency ?? 'BOB',
      payment_type: qr.payment_type ?? dto?.payment_type ?? 'RENT',
      status: qr.estado,
      qr_image: this.extractQrImage(qr.imagen_qr),
      notes: dto?.notes ?? qr.detalle_glosa ?? null,
      expires_at: qr.fecha_vencimiento,
      created_at: qr.created_at,
      updated_at: qr.updated_at,
    };
  }

  assertTenantOwnership(
    qr: QrPaymentDbRow,
    tenantId: number | undefined,
    action: 'verificar' | 'cancelar',
  ): void {
    if (tenantId !== undefined && qr.tenant_id !== tenantId) {
      throw new ForbiddenException(`No tienes permiso para ${action} este QR`);
    }
  }

  private extractQrImage(imagenQr: QrPaymentDbRow['imagen_qr']): string | null {
    if (!imagenQr) return null;

    if (typeof imagenQr === 'string') {
      try {
        const parsed = JSON.parse(imagenQr) as unknown;
        if (isObjectRecord(parsed) && typeof parsed.imagenQr === 'string') {
          return parsed.imagenQr;
        }
      } catch {
        return imagenQr;
      }

      return null;
    }

    if (typeof imagenQr.imagenQr === 'string') {
      return imagenQr.imagenQr;
    }

    return null;
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
