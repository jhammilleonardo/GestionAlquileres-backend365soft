import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import { MoneyDecimal } from '../common/money';
import { AccountingLedgerService } from './accounting-ledger.service';
import { JournalLineInput, PostedJournalEntry } from './accounting.types';

interface OwnerStatementPostingRow {
  id: number;
  rental_owner_id: number;
  property_id: number;
  unit_id: number | null;
  gross_rent: string | number;
  maintenance_deduction: string | number;
  management_commission: string | number;
  net_amount: string | number;
  period_year: number;
  period_month: number;
}

@Injectable()
export class AccountingOwnerStatementPostingService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingLedgerService: AccountingLedgerService,
  ) {}

  async postGeneratedStatement(
    schemaName: string,
    statementId: number,
  ): Promise<PostedJournalEntry> {
    const statement = await this.findStatement(schemaName, statementId);
    const grossRent = this.toAmount(statement.gross_rent);
    const commission = this.toAmount(statement.management_commission);
    const netAmount = this.toAmount(statement.net_amount);
    const maintenanceDeduction = this.toAmount(statement.maintenance_deduction);

    if (grossRent <= 0 || netAmount < 0) {
      throw new BadRequestException(
        `Owner statement #${statementId} tiene montos contables invalidos.`,
      );
    }

    // Cuadre exacto en centavos (sin float): gross == comisión + neto + deducción.
    const grossCents = this.toCents(statement.gross_rent);
    const creditCents =
      this.toCents(statement.management_commission) +
      this.toCents(statement.net_amount) +
      this.toCents(statement.maintenance_deduction);
    if (grossCents !== creditCents) {
      throw new BadRequestException(
        `Owner statement #${statementId} no cuadra: gross_rent debe igualar comision + neto + deducciones.`,
      );
    }

    const lines: JournalLineInput[] = [
      {
        accountCode: '4000',
        debit: grossRent,
        propertyId: statement.property_id,
        unitId: statement.unit_id,
        ownerId: statement.rental_owner_id,
        memo: 'Reclasificacion de renta para liquidacion propietario',
      },
    ];

    if (commission > 0) {
      lines.push({
        accountCode: '4200',
        credit: commission,
        propertyId: statement.property_id,
        unitId: statement.unit_id,
        ownerId: statement.rental_owner_id,
        memo: 'Comision de administracion',
      });
    }

    if (netAmount > 0) {
      lines.push({
        accountCode: '2100',
        credit: netAmount,
        propertyId: statement.property_id,
        unitId: statement.unit_id,
        ownerId: statement.rental_owner_id,
        memo: 'Por pagar a propietario',
      });
    }

    if (maintenanceDeduction > 0) {
      lines.push({
        accountCode: '5200',
        credit: maintenanceDeduction,
        propertyId: statement.property_id,
        unitId: statement.unit_id,
        ownerId: statement.rental_owner_id,
        memo: 'Recupero de mantenimiento deducido al propietario',
      });
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: this.statementPeriodDate(statement),
      description: `Posteo de liquidacion propietario #${statement.id}`,
      sourceModule: 'owner_statements',
      sourceId: `generated:${statement.id}`,
      basis: 'cash',
      metadata: { ownerStatementId: statement.id },
      lines,
    });

    await this.markStatementGeneratedPosted(
      schemaName,
      statement.id,
      result.id,
    );

    return result;
  }

  async postStatementTransfer(
    schemaName: string,
    statementId: number,
  ): Promise<PostedJournalEntry> {
    const statement = await this.findStatement(schemaName, statementId);
    const netAmount = this.toAmount(statement.net_amount);

    if (netAmount <= 0) {
      throw new BadRequestException(
        `Owner statement #${statementId} no tiene net_amount transferible.`,
      );
    }

    const result = await this.accountingLedgerService.postEntry({
      schemaName,
      entryDate: new Date().toISOString().slice(0, 10),
      description: `Transferencia a propietario statement #${statement.id}`,
      sourceModule: 'owner_statement_transfers',
      sourceId: String(statement.id),
      basis: 'cash',
      metadata: { ownerStatementId: statement.id },
      lines: [
        {
          accountCode: '2100',
          debit: netAmount,
          propertyId: statement.property_id,
          unitId: statement.unit_id,
          ownerId: statement.rental_owner_id,
          memo: 'Pago de saldo a propietario',
        },
        {
          accountCode: '1100',
          credit: netAmount,
          propertyId: statement.property_id,
          unitId: statement.unit_id,
          ownerId: statement.rental_owner_id,
          memo: 'Salida de caja/banco a propietario',
        },
      ],
    });

    await this.markStatementTransferPosted(schemaName, statement.id, result.id);

    return result;
  }

  private async findStatement(
    schemaName: string,
    statementId: number,
  ): Promise<OwnerStatementPostingRow> {
    const schema = quoteIdent(schemaName);
    const rows = await this.dataSource.query<OwnerStatementPostingRow[]>(
      `
        SELECT id, rental_owner_id, property_id, unit_id, gross_rent,
               maintenance_deduction, management_commission, net_amount,
               period_year, period_month
        FROM ${schema}.owner_statements
        WHERE id = $1
        LIMIT 1
      `,
      [statementId],
    );
    const statement = rows[0];

    if (!statement) {
      throw new BadRequestException(
        `Owner statement #${statementId} no encontrado para posteo contable.`,
      );
    }

    return statement;
  }

  private async markStatementGeneratedPosted(
    schemaName: string,
    statementId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);
    await this.dataSource.query(
      `
        UPDATE ${schema}.owner_statements
        SET accounting_status = 'posted',
            journal_entry_id = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [journalEntryId, statementId],
    );
  }

  private async markStatementTransferPosted(
    schemaName: string,
    statementId: number,
    journalEntryId: number,
  ): Promise<void> {
    const schema = quoteIdent(schemaName);
    await this.dataSource.query(
      `
        UPDATE ${schema}.owner_statements
        SET accounting_status = 'transferred_posted',
            transfer_journal_entry_id = $1,
            updated_at = NOW()
        WHERE id = $2
      `,
      [journalEntryId, statementId],
    );
  }

  private toAmount(value: string | number): number {
    const amount = Number(value);
    return Number.isFinite(amount) ? amount : Number.NaN;
  }

  /** Centavos enteros exactos (sin float) para validar el cuadre del asiento. */
  private toCents(value: string | number): number {
    return new MoneyDecimal(value).times(100).toDecimalPlaces(0).toNumber();
  }

  private statementPeriodDate(statement: OwnerStatementPostingRow): string {
    return `${statement.period_year}-${String(statement.period_month).padStart(2, '0')}-01`;
  }
}
