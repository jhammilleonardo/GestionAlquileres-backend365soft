import { AccountingManualEntryService } from './accounting-manual-entry.service';
import { AccountingLedgerService } from './accounting-ledger.service';
import { TenantsService } from '../tenants/tenants.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';

describe('AccountingManualEntryService', () => {
  let service: AccountingManualEntryService;
  let ledger: { postEntry: jest.Mock };
  let tenants: { findBySlug: jest.Mock };
  let audit: { log: jest.Mock };

  beforeEach(() => {
    ledger = {
      postEntry: jest.fn().mockResolvedValue({ id: 7, entryNumber: 'JE-7' }),
    };
    tenants = {
      findBySlug: jest.fn().mockResolvedValue({ schema_name: 'tenant_acme' }),
    };
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    service = new AccountingManualEntryService(
      ledger as unknown as AccountingLedgerService,
      tenants as unknown as TenantsService,
      audit as unknown as AuditLogsService,
    );
  });

  it('postea el asiento manual con sourceModule=manual y schema del tenant', async () => {
    const dto: CreateJournalEntryDto = {
      entryDate: '2026-06-27',
      description: 'Ajuste',
      lines: [
        { accountCode: '1100', debit: 100 },
        { accountCode: '4100', credit: 100 },
      ],
    };

    const result = await service.createManualEntry('acme', dto);

    expect(result).toEqual({ id: 7, entryNumber: 'JE-7' });
    expect(ledger.postEntry).toHaveBeenCalledTimes(1);
    expect(ledger.postEntry).toHaveBeenCalledWith(
      expect.objectContaining({
        schemaName: 'tenant_acme',
        sourceModule: 'manual',
        basis: 'accrual',
        lines: [
          { accountCode: '1100', debit: 100, credit: undefined, memo: null },
          { accountCode: '4100', debit: undefined, credit: 100, memo: null },
        ],
      }),
    );
  });

  it('registra auditoría del asiento creado', async () => {
    const dto: CreateJournalEntryDto = {
      entryDate: '2026-06-27',
      description: 'Ajuste',
      basis: 'cash',
      lines: [
        { accountCode: '1100', debit: 50 },
        { accountCode: '4100', credit: 50 },
      ],
    };

    await service.createManualEntry('acme', dto);

    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: AuditAction.CREATED,
        entityType: 'journal_entry',
        entityId: 7,
      }),
    );
  });
});
