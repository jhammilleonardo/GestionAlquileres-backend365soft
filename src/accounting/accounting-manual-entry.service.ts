import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { AccountingLedgerService } from './accounting-ledger.service';
import { TenantsService } from '../tenants/tenants.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
import { PostedJournalEntry } from './accounting.types';

/**
 * Asientos contables manuales (General Journal Entries). Reutiliza el motor de
 * posteo (`AccountingLedgerService.postEntry`), que valida el cuadre exacto en
 * centavos enteros y la existencia de las cuentas antes de insertar. Cada asiento
 * manual lleva un `sourceId` único para no chocar con la deduplicación del motor.
 */
@Injectable()
export class AccountingManualEntryService {
  constructor(
    private readonly ledgerService: AccountingLedgerService,
    private readonly tenantsService: TenantsService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async createManualEntry(
    slug: string,
    dto: CreateJournalEntryDto,
  ): Promise<PostedJournalEntry> {
    const tenant = await this.tenantsService.findBySlug(slug);

    const posted = await this.ledgerService.postEntry({
      schemaName: tenant.schema_name,
      entryDate: dto.entryDate,
      description: dto.description,
      sourceModule: 'manual',
      sourceId: randomUUID(),
      basis: dto.basis ?? 'accrual',
      metadata: { manual: true },
      lines: dto.lines.map((line) => ({
        accountCode: line.accountCode,
        debit: line.debit,
        credit: line.credit,
        memo: line.memo ?? null,
      })),
    });

    await this.auditLogsService.log({
      action: AuditAction.CREATED,
      entityType: 'journal_entry',
      entityId: posted.id,
      newValues: {
        entry_number: posted.entryNumber,
        description: dto.description,
        entry_date: dto.entryDate,
        line_count: dto.lines.length,
        manual: true,
      },
    });

    return posted;
  }
}
