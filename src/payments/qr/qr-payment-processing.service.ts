import { Injectable, Logger } from '@nestjs/common';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../../common/utils/sql-identifier';
import { QR_ESTADO } from './qr-payment.constants';
import {
  PaymentMethod,
  PaymentProcessor,
  PaymentStatus,
  PaymentType,
} from '../enums';

export interface QrPaymentRow {
  id: number;
  tenant_id: number;
  contract_id?: number | null;
  pago_id?: number | null;
  monto: string | number;
  alias: string;
  detalle_glosa?: string | null;
  estado?: string | null;
}

export interface QrPaymentProcessingResult {
  payment_processed: true;
  payment_id: number | null;
  qr_id: number;
  qr_monto: string | number;
  message: string;
}

@Injectable()
export class QrPaymentProcessingService {
  private readonly logger = new Logger(QrPaymentProcessingService.name);

  constructor(private readonly dataSource: DataSource) {}

  async procesarPagoQr(
    schemaName: string,
    qr: QrPaymentRow,
  ): Promise<QrPaymentProcessingResult> {
    const schemaPrefix = `${quoteIdent(schemaName)}.`;
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const lockedQr = await this.lockQrPayment(schemaPrefix, qr, queryRunner);

      if (lockedQr.pago_id) {
        await queryRunner.commitTransaction();

        return {
          payment_processed: true,
          payment_id: lockedQr.pago_id,
          qr_id: lockedQr.id,
          qr_monto: lockedQr.monto,
          message: 'QR ya tenia un pago asociado; no se duplico el registro.',
        };
      }

      const contract = await this.resolveContractAndProperty(
        schemaPrefix,
        lockedQr,
        queryRunner,
      );
      let paymentId: number | null = null;

      if (contract.contractId && contract.propertyId) {
        const today = new Date().toISOString().split('T')[0];
        const [payment] = (await queryRunner.query(
          `INSERT INTO ${schemaPrefix}payments (
             tenant_id, contract_id, property_id, amount, currency,
             payment_type, payment_method, status, payment_date,
             reference_number, notes, payment_processor,
             created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'BOB',$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
          RETURNING id`,
          [
            lockedQr.tenant_id,
            contract.contractId,
            contract.propertyId,
            lockedQr.monto,
            PaymentType.RENT,
            PaymentMethod.QR_MC4,
            PaymentStatus.APPROVED,
            today,
            `QR-${lockedQr.alias}`,
            lockedQr.detalle_glosa ?? 'Pago vía QR MC4',
            PaymentProcessor.MC4_QR,
          ],
        )) as { id: number }[];
        paymentId = payment?.id ?? null;
      }

      await queryRunner.query(
        `UPDATE ${schemaPrefix}qr_payments SET pago_id = $1, estado = $2, updated_at = NOW() WHERE id = $3`,
        [paymentId, QR_ESTADO.PAGADO, lockedQr.id],
      );

      await queryRunner.commitTransaction();

      return {
        payment_processed: true,
        payment_id: paymentId,
        qr_id: lockedQr.id,
        qr_monto: lockedQr.monto,
        message: 'QR marcado como pagado y pago registrado automáticamente.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(
        `Error procesando pago QR: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error ? error.stack : undefined,
      );
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private async resolveContractAndProperty(
    schemaPrefix: string,
    qr: QrPaymentRow,
    queryRunner: QueryRunner,
  ): Promise<{ contractId: number | null; propertyId: number | null }> {
    let contractId: number | null = qr.contract_id ?? null;
    let propertyId: number | null = null;

    if (!contractId) {
      const contracts = (await queryRunner.query(
        `SELECT id, property_id FROM ${schemaPrefix}contracts
         WHERE tenant_id = $1 AND status IN ('ACTIVO', 'POR_VENCER')
         ORDER BY created_at DESC LIMIT 1`,
        [qr.tenant_id],
      )) as { id: number; property_id: number }[];

      if (contracts.length > 0) {
        contractId = contracts[0].id;
        propertyId = contracts[0].property_id;
      }
    } else {
      const contracts = (await queryRunner.query(
        `SELECT property_id FROM ${schemaPrefix}contracts WHERE id = $1 LIMIT 1`,
        [contractId],
      )) as { property_id: number }[];

      if (contracts.length > 0) {
        propertyId = contracts[0].property_id;
      }
    }

    return { contractId, propertyId };
  }

  private async lockQrPayment(
    schemaPrefix: string,
    qr: QrPaymentRow,
    queryRunner: QueryRunner,
  ): Promise<QrPaymentRow> {
    const rows = (await queryRunner.query(
      `SELECT id, tenant_id, contract_id, pago_id, monto, alias, detalle_glosa, estado
       FROM ${schemaPrefix}qr_payments
       WHERE id = $1
       FOR UPDATE`,
      [qr.id],
    )) as QrPaymentRow[];

    return rows[0] ?? qr;
  }
}
