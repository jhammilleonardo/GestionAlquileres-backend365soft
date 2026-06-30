import { DataSource } from 'typeorm';
import { TenantAccountingProvisioningService } from './tenant-accounting-provisioning.service';

describe('TenantAccountingProvisioningService', () => {
  let dataSource: { query: jest.Mock };
  let service: TenantAccountingProvisioningService;

  beforeEach(() => {
    dataSource = { query: jest.fn().mockResolvedValue([]) };
    service = new TenantAccountingProvisioningService(
      dataSource as unknown as DataSource,
    );
  });

  it('creates accounting tables, seeds accounts and links domain posting columns', async () => {
    await service.ensureAccounting('tenant_alpha');

    const sql = dataSource.query.mock.calls
      .map(([query]) => String(query))
      .join('\n');

    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".chart_of_accounts',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".journal_entries',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".journal_lines',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".accounting_outbox',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".accounting_periods',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".bank_accounts',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".bank_transactions',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".bank_reconciliations',
    );
    expect(sql).toContain(
      'CREATE TABLE IF NOT EXISTS "tenant_alpha".accounting_schema_version',
    );
    expect(sql).toContain('ALTER TABLE "tenant_alpha".payments');
    expect(sql).toContain('ALTER TABLE "tenant_alpha".expenses');
    expect(sql).toContain('ALTER TABLE "tenant_alpha".owner_statements');
    expect(sql).toContain('accounting_status');
    expect(sql).toContain('journal_entry_id');
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO "tenant_alpha".chart_of_accounts'),
      ['4000', 'Rental income', 'income', '[]'],
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining(
        'INSERT INTO "tenant_alpha".accounting_schema_version',
      ),
      [3],
    );
  });

  it('rejects unsafe schema identifiers before building SQL', async () => {
    await expect(service.ensureAccounting('tenant_alpha;drop')).rejects.toThrow(
      'Identificador SQL inválido',
    );
  });
});
