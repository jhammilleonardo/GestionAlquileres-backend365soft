import { BadRequestException, Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DataSource, QueryRunner } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import {
  JournalLineInput,
  PostJournalEntryInput,
  PostedJournalEntry,
  ReverseJournalEntryInput,
} from './accounting.types';
import { AccountingPeriodsService } from './accounting-periods.service';

interface InsertedJournalEntryRow {
  id: number | string;
  entry_number: string;
}

interface AccountIdRow {
  id: number | string;
}

interface OriginalJournalEntryRow {
  id: number | string;
  entry_number: string;
  basis: 'cash' | 'accrual';
}

interface JournalLineRow {
  account_id: number | string;
  property_id: number | string | null;
  unit_id: number | string | null;
  owner_id: number | string | null;
  tenant_user_id: number | string | null;
  vendor_id: number | string | null;
  contract_id: number | string | null;
  payment_id: number | string | null;
  expense_id: number | string | null;
  debit: number | string;
  credit: number | string;
  memo: string | null;
}

@Injectable()
export class AccountingLedgerService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly accountingPeriodsService: AccountingPeriodsService,
  ) {}

  async postEntry(input: PostJournalEntryInput): Promise<PostedJournalEntry> {
    this.validateEntry(input);

    const schema = quoteIdent(input.schemaName);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const existing = await this.findExistingEntry(
        queryRunner,
        schema,
        input.sourceModule,
        input.sourceId,
      );

      if (existing) {
        await queryRunner.commitTransaction();
        return existing;
      }

      await this.accountingPeriodsService.assertPeriodOpen(
        input.schemaName,
        input.entryDate,
        queryRunner,
      );

      const entryNumber = this.createEntryNumber();
      const entryRows = (await queryRunner.query(
        `
          INSERT INTO ${schema}.journal_entries
            (entry_number, entry_date, description, source_module, source_id, basis, status, posted_at, metadata)
          VALUES ($1, $2, $3, $4, $5, $6, 'posted', NOW(), $7::jsonb)
          RETURNING id, entry_number
        `,
        [
          entryNumber,
          input.entryDate,
          input.description,
          input.sourceModule ?? null,
          input.sourceId ?? null,
          input.basis ?? 'cash',
          JSON.stringify(input.metadata ?? {}),
        ],
      )) as unknown as InsertedJournalEntryRow[];
      const entry = entryRows[0];

      if (!entry) {
        throw new BadRequestException('No se pudo crear el asiento contable.');
      }

      for (const line of input.lines) {
        const accountId = await this.findAccountId(
          queryRunner,
          schema,
          line.accountCode,
        );

        await this.insertJournalLine(
          queryRunner,
          schema,
          Number(entry.id),
          accountId,
          line,
        );
      }

      await queryRunner.commitTransaction();

      return {
        id: Number(entry.id),
        entryNumber: String(entry.entry_number),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  async reverseEntry(
    input: ReverseJournalEntryInput,
  ): Promise<PostedJournalEntry> {
    if (!Number.isInteger(input.entryId) || input.entryId <= 0) {
      throw new BadRequestException('entryId invalido.');
    }

    const schema = quoteIdent(input.schemaName);
    const queryRunner = this.dataSource.createQueryRunner();

    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      const original = await this.findPostedEntryForReversal(
        queryRunner,
        schema,
        input.entryId,
      );

      await this.accountingPeriodsService.assertPeriodOpen(
        input.schemaName,
        input.reversalDate,
        queryRunner,
      );

      const originalLines = await this.findEntryLines(
        queryRunner,
        schema,
        input.entryId,
      );

      if (originalLines.length < 2) {
        throw new BadRequestException(
          'El asiento original no tiene lineas suficientes para reversa.',
        );
      }

      const reversalEntryNumber = this.createEntryNumber();
      const reversalRows = (await queryRunner.query(
        `
          INSERT INTO ${schema}.journal_entries
            (entry_number, entry_date, description, source_module, source_id, basis, status, posted_at, metadata)
          VALUES ($1, $2, $3, 'journal_reversal', $4, $5, 'posted', NOW(), $6::jsonb)
          RETURNING id, entry_number
        `,
        [
          reversalEntryNumber,
          input.reversalDate,
          input.description ?? `Reversa del asiento ${original.entry_number}`,
          String(input.entryId),
          original.basis,
          JSON.stringify({ reversedEntryId: input.entryId }),
        ],
      )) as unknown as InsertedJournalEntryRow[];
      const reversal = reversalRows[0];

      if (!reversal) {
        throw new BadRequestException('No se pudo crear la reversa contable.');
      }

      for (const line of originalLines) {
        await this.insertJournalLineByAccountId(
          queryRunner,
          schema,
          Number(reversal.id),
          Number(line.account_id),
          {
            propertyId: this.nullableNumber(line.property_id),
            unitId: this.nullableNumber(line.unit_id),
            ownerId: this.nullableNumber(line.owner_id),
            tenantUserId: this.nullableNumber(line.tenant_user_id),
            vendorId: this.nullableNumber(line.vendor_id),
            contractId: this.nullableNumber(line.contract_id),
            paymentId: this.nullableNumber(line.payment_id),
            expenseId: this.nullableNumber(line.expense_id),
            debit: Number(line.credit),
            credit: Number(line.debit),
            memo: line.memo
              ? `Reversa: ${line.memo}`
              : `Reversa de ${original.entry_number}`,
          },
        );
      }

      await queryRunner.query(
        `
          UPDATE ${schema}.journal_entries
          SET status = 'reversed',
              reversed_entry_id = $1,
              updated_at = NOW()
          WHERE id = $2
        `,
        [Number(reversal.id), input.entryId],
      );

      await queryRunner.commitTransaction();

      return {
        id: Number(reversal.id),
        entryNumber: String(reversal.entry_number),
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  private validateEntry(input: PostJournalEntryInput): void {
    if (!input.lines || input.lines.length < 2) {
      throw new BadRequestException(
        'Un asiento contable requiere al menos dos lineas.',
      );
    }

    let debitCents = 0;
    let creditCents = 0;

    for (const line of input.lines) {
      if (!line.accountCode?.trim()) {
        throw new BadRequestException('Cada linea requiere accountCode.');
      }

      const debit = this.toCents(line.debit ?? 0);
      const credit = this.toCents(line.credit ?? 0);

      if ((debit > 0 && credit > 0) || (debit === 0 && credit === 0)) {
        throw new BadRequestException(
          'Cada linea debe tener solo debito o solo credito.',
        );
      }

      debitCents += debit;
      creditCents += credit;
    }

    if (debitCents !== creditCents) {
      throw new BadRequestException(
        'El asiento contable no esta balanceado: debitos y creditos deben coincidir.',
      );
    }
  }

  private async findAccountId(
    queryRunner: QueryRunner,
    schema: string,
    accountCode: string,
  ): Promise<number> {
    const accountRows = (await queryRunner.query(
      `
        SELECT id
        FROM ${schema}.chart_of_accounts
        WHERE code = $1 AND is_active = true
        LIMIT 1
      `,
      [accountCode],
    )) as unknown as AccountIdRow[];
    const account = accountRows[0];

    if (!account) {
      throw new BadRequestException(
        `Cuenta contable no encontrada: ${accountCode}`,
      );
    }

    return Number(account.id);
  }

  private async findExistingEntry(
    queryRunner: QueryRunner,
    schema: string,
    sourceModule?: string | null,
    sourceId?: string | null,
  ): Promise<PostedJournalEntry | null> {
    if (!sourceModule || !sourceId) {
      return null;
    }

    const rows = (await queryRunner.query(
      `
        SELECT id, entry_number
        FROM ${schema}.journal_entries
        WHERE source_module = $1 AND source_id = $2
        LIMIT 1
      `,
      [sourceModule, sourceId],
    )) as unknown as InsertedJournalEntryRow[];
    const entry = rows[0];

    return entry
      ? { id: Number(entry.id), entryNumber: String(entry.entry_number) }
      : null;
  }

  private async findPostedEntryForReversal(
    queryRunner: QueryRunner,
    schema: string,
    entryId: number,
  ): Promise<OriginalJournalEntryRow> {
    const rows = (await queryRunner.query(
      `
        SELECT id, entry_number, basis
        FROM ${schema}.journal_entries
        WHERE id = $1 AND status = 'posted'
        LIMIT 1
      `,
      [entryId],
    )) as unknown as OriginalJournalEntryRow[];
    const entry = rows[0];

    if (!entry) {
      throw new BadRequestException(
        'Asiento contable no encontrado o ya reversado.',
      );
    }

    return entry;
  }

  private async findEntryLines(
    queryRunner: QueryRunner,
    schema: string,
    entryId: number,
  ): Promise<JournalLineRow[]> {
    return (await queryRunner.query(
      `
        SELECT account_id, property_id, unit_id, owner_id, tenant_user_id,
               vendor_id, contract_id, payment_id, expense_id, debit, credit, memo
        FROM ${schema}.journal_lines
        WHERE journal_entry_id = $1
        ORDER BY id ASC
      `,
      [entryId],
    )) as unknown as JournalLineRow[];
  }

  private async insertJournalLine(
    queryRunner: QueryRunner,
    schema: string,
    entryId: number,
    accountId: number,
    line: JournalLineInput,
  ): Promise<void> {
    await this.insertJournalLineByAccountId(
      queryRunner,
      schema,
      entryId,
      accountId,
      {
        propertyId: line.propertyId ?? null,
        unitId: line.unitId ?? null,
        ownerId: line.ownerId ?? null,
        tenantUserId: line.tenantUserId ?? null,
        vendorId: line.vendorId ?? null,
        contractId: line.contractId ?? null,
        paymentId: line.paymentId ?? null,
        expenseId: line.expenseId ?? null,
        debit: line.debit ?? 0,
        credit: line.credit ?? 0,
        memo: line.memo ?? null,
      },
    );
  }

  private async insertJournalLineByAccountId(
    queryRunner: QueryRunner,
    schema: string,
    entryId: number,
    accountId: number,
    line: Omit<JournalLineInput, 'accountCode'>,
  ): Promise<void> {
    await queryRunner.query(
      `
        INSERT INTO ${schema}.journal_lines (
          journal_entry_id,
          account_id,
          property_id,
          unit_id,
          owner_id,
          tenant_user_id,
          vendor_id,
          contract_id,
          payment_id,
          expense_id,
          debit,
          credit,
          memo
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      `,
      [
        entryId,
        accountId,
        line.propertyId ?? null,
        line.unitId ?? null,
        line.ownerId ?? null,
        line.tenantUserId ?? null,
        line.vendorId ?? null,
        line.contractId ?? null,
        line.paymentId ?? null,
        line.expenseId ?? null,
        line.debit ?? 0,
        line.credit ?? 0,
        line.memo ?? null,
      ],
    );
  }

  private nullableNumber(value: number | string | null): number | null {
    return value === null ? null : Number(value);
  }

  private toCents(amount: number): number {
    if (!Number.isFinite(amount) || amount < 0) {
      throw new BadRequestException(
        'Los montos contables deben ser positivos.',
      );
    }

    return Math.round(amount * 100);
  }

  private createEntryNumber(): string {
    return `JE-${randomUUID()}`;
  }
}
