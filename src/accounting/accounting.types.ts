export type AccountingBasis = 'cash' | 'accrual';

export interface JournalLineInput {
  accountCode: string;
  debit?: number;
  credit?: number;
  propertyId?: number | null;
  unitId?: number | null;
  ownerId?: number | null;
  tenantUserId?: number | null;
  vendorId?: number | null;
  contractId?: number | null;
  paymentId?: number | null;
  expenseId?: number | null;
  memo?: string | null;
}

export interface PostJournalEntryInput {
  schemaName: string;
  entryDate: string;
  description: string;
  sourceModule?: string | null;
  sourceId?: string | null;
  basis?: AccountingBasis;
  metadata?: Record<string, unknown>;
  lines: JournalLineInput[];
}

export interface PostedJournalEntry {
  id: number;
  entryNumber: string;
}

export interface ReverseJournalEntryInput {
  schemaName: string;
  entryId: number;
  reversalDate: string;
  description?: string | null;
}
