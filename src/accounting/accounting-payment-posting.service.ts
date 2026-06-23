import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { PaymentType } from '../payments/enums';
import { AccountingLedgerService } from './accounting-ledger.service';
import { PostedJournalEntry } from './accounting.types';

interface PaymentPostingRow {
  id: number;
  contract_id: number;
  property_id: number;
  amount: string | number;
  payment_type: PaymentType;
  payment_date: string | Date;
  accounting_status?: string | null;
}

@Injectable()
export class AccountingPaymentPostingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingLedgerService: AccountingLedgerService,
  ) {}

  async postApprovedPayment(
    schemaName: string,
    paymentId: number,
  ): Promise<PostedJournalEntry> {
    const payment = await this.findPayment(schemaName, paymentId);
    const amount = Number(payment.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      throw new BadRequestException(
        `Pago #${paymentId} tiene monto contable invalido.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.toDateOnly(payment.payment_date),
      description: `Posteo de pago aprobado #${payment.id}`,
      sourceModule: 'payments',
      sourceId: String(payment.id),
      basis: 'cash',
      metadata: {
        paymentId: payment.id,
        paymentType: payment.payment_type,
      },
      lines: [
        {
          accountCode: '1100',
          debit: amount,
          propertyId: payment.property_id,
          contractId: payment.contract_id,
          paymentId: payment.id,
          memo: 'Cobro recibido',
        },
        {
          accountCode: this.incomeAccountForPaymentType(payment.payment_type),
          credit: amount,
          propertyId: payment.property_id,
          contractId: payment.contract_id,
          paymentId: payment.id,
          memo: `Ingreso por ${payment.payment_type}`,
        },
      ],
    });

    await this.markPaymentPosted(schemaName, payment.id, result.id);

    return result;
  }

  private async findPayment(
    schemaName: string,
    paymentId: number,
  ): Promise<PaymentPostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<PaymentPostingRow[]>(
      `
        SELECT id, contract_id, property_id, amount, payment_type, payment_date, accounting_status
        FROM ${schema}.payments
        WHERE id = $1 AND status = 'APPROVED'
        LIMIT 1
      `,
      [paymentId],
    );
    const payment = rows[0];

    if (!payment) {
      throw new BadRequestException(
        `Pago aprobado #${paymentId} no encontrado para posteo contable.`,
      );
    }

    return payment;
  }

  private async markPaymentPosted(
    schemaName: string,
    paymentId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.payments
        SET accounting_status = 'posted',
            journal_entry_id = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [journalEntryId, paymentId],
    );
  }

  private incomeAccountForPaymentType(paymentType: PaymentType): string {
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
