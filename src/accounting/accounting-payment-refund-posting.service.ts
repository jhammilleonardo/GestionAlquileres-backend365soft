import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { PaymentType } from '../payments/enums';
import { AccountingLedgerService } from './accounting-ledger.service';
import { PostedJournalEntry } from './accounting.types';

interface PaymentRefundPostingRow {
  refund_id: number;
  payment_id: number;
  amount: string | number;
  refund_date: string | Date;
  payment_type: PaymentType;
  property_id: number;
  contract_id: number;
}

@Injectable()
export class AccountingPaymentRefundPostingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingLedgerService: AccountingLedgerService,
  ) {}

  async postPaymentRefund(
    schemaName: string,
    refundId: number,
  ): Promise<PostedJournalEntry> {
    const refund = await this.findRefund(schemaName, refundId);
    const amount = Number(refund.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Reembolso #${refundId} tiene monto contable invalido.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.toDateOnly(refund.refund_date),
      description: `Posteo de reembolso #${refund.refund_id}`,
      sourceModule: 'payment_refunds',
      sourceId: String(refund.refund_id),
      basis: 'cash',
      metadata: {
        refundId: refund.refund_id,
        paymentId: refund.payment_id,
        paymentType: refund.payment_type,
      },
      lines: [
        {
          accountCode: this.offsetAccountForPaymentType(refund.payment_type),
          debit: amount,
          propertyId: refund.property_id,
          contractId: refund.contract_id,
          paymentId: refund.payment_id,
          memo: `Reembolso de ${refund.payment_type}`,
        },
        {
          accountCode: '1100',
          credit: amount,
          propertyId: refund.property_id,
          contractId: refund.contract_id,
          paymentId: refund.payment_id,
          memo: 'Salida por reembolso',
        },
      ],
    });

    await this.markRefundPosted(schemaName, refund.refund_id, result.id);

    return result;
  }

  private async findRefund(
    schemaName: string,
    refundId: number,
  ): Promise<PaymentRefundPostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<PaymentRefundPostingRow[]>(
      `
        SELECT r.id AS refund_id,
               r.payment_id,
               r.amount,
               r.refund_date,
               p.payment_type,
               p.property_id,
               p.contract_id
        FROM ${schema}.payment_refunds r
        INNER JOIN ${schema}.payments p ON p.id = r.payment_id
        WHERE r.id = $1
        LIMIT 1
      `,
      [refundId],
    );
    const refund = rows[0];

    if (!refund) {
      throw new BadRequestException(
        `Reembolso #${refundId} no encontrado para posteo contable.`,
      );
    }

    return refund;
  }

  private async markRefundPosted(
    schemaName: string,
    refundId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.payment_refunds
        SET accounting_status = 'posted',
            journal_entry_id = $1
        WHERE id = $2
      `,
      [journalEntryId, refundId],
    );
  }

  private offsetAccountForPaymentType(paymentType: PaymentType): string {
    switch (paymentType) {
      case PaymentType.RENT:
        return '4000';
      case PaymentType.LATE_FEE:
        return '4100';
      case PaymentType.DEPOSIT:
        return '2200';
      default:
        return '4300';
    }
  }

  private toDateOnly(value: string | Date): string {
    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return String(value).slice(0, 10);
  }
}
