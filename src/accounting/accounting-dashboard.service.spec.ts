import { AccountingDashboardService } from './accounting-dashboard.service';

describe('AccountingDashboardService', () => {
  let service: AccountingDashboardService;
  let dataSource: { query: jest.Mock };
  let tenantsService: { findBySlug: jest.Mock };
  let reportsService: {
    getTrialBalance: jest.Mock;
    getBalanceSheet: jest.Mock;
    getIncomeStatement: jest.Mock;
  };
  let paymentLedgerService: { getAdminLedger: jest.Mock };

  beforeEach(() => {
    dataSource = {
      query: jest.fn((sql: string) => {
        if (sql.includes('FROM information_schema.tables')) {
          return Promise.resolve([{ exists: true }]);
        }

        if (sql.includes('FROM "tenant_acme".tenant_config')) {
          return Promise.resolve([
            {
              country: 'BO',
              currency: 'BOB',
              rental_type: 'BOTH',
              occupancy_tax_pct: '3.00',
              accounting_basis: 'cash',
              tax_id: '1234567',
              legal_name: '365Soft SRL',
              tax_regime: 'REGIMEN_GENERAL',
            },
          ]);
        }

        if (sql.includes('SUM(e.amount)')) {
          return Promise.resolve([{ total: '350.50', count: 2 }]);
        }

        if (sql.includes('FROM "tenant_acme".expenses e')) {
          return Promise.resolve([
            {
              id: 11,
              vendor_name: 'Proveedor AC',
              property_id: 4,
              property_name: 'Casa Centro',
              category: 'MAINTENANCE',
              due_date: '2026-06-15',
              amount: '200.25',
              currency: 'BOB',
              invoice_number: 'F-10',
            },
          ]);
        }

        if (
          sql.includes('FROM "tenant_acme".owner_statements os') &&
          sql.includes('pending_total')
        ) {
          return Promise.resolve([
            {
              pending_total: '700.00',
              transferred_total: '1200.00',
              statement_count: 3,
            },
          ]);
        }

        if (sql.includes('FROM "tenant_acme".owner_statements os')) {
          return Promise.resolve([
            {
              id: 21,
              rental_owner_id: 5,
              owner_name: 'Dueño Uno',
              property_id: 4,
              property_name: 'Casa Centro',
              period_month: 6,
              period_year: 2026,
              gross_rent: '1000.00',
              maintenance_deduction: '100.00',
              management_commission: '200.00',
              net_amount: '700.00',
              currency: 'BOB',
              status: 'pending',
              transferred_at: null,
            },
          ]);
        }

        if (sql.includes('FROM "tenant_acme".bank_accounts ba')) {
          return Promise.resolve([
            {
              id: 3,
              name: 'Cuenta operativa',
              bank_name: 'Banco Unión',
              currency: 'BOB',
              gl_account_code: '1100',
              gl_account_name: 'Operating cash and bank',
              book_balance: '5000.00',
              imported_transactions: 4,
              matched_transactions: 9,
              last_reconciled_at: '2026-06-20T10:00:00.000Z',
            },
          ]);
        }

        return Promise.resolve([]);
      }),
    };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({ schema_name: 'tenant_acme' }),
    };
    reportsService = {
      getTrialBalance: jest.fn().mockResolvedValue({ balanced: true }),
      getBalanceSheet: jest.fn().mockResolvedValue({ balanced: true }),
      getIncomeStatement: jest.fn().mockResolvedValue({ net_income: 900 }),
    };
    paymentLedgerService = {
      getAdminLedger: jest.fn().mockResolvedValue({
        summary: { total_receivable: 1200 },
        long_term: [],
        short_term: [],
        alerts: [],
      }),
    };

    service = new AccountingDashboardService(
      dataSource as never,
      tenantsService as never,
      reportsService as never,
      paymentLedgerService as never,
    );
  });

  it('compone el dashboard contable desde perfil, reportes, cobranza y cuentas por pagar', async () => {
    const result = await service.getDashboard('acme', {
      from: '2026-06-01',
      to: '2026-06-30',
    });

    expect(tenantsService.findBySlug).toHaveBeenCalledWith('acme');
    expect(reportsService.getBalanceSheet).toHaveBeenCalledWith('acme', {
      asOf: '2026-06-30',
    });
    expect(paymentLedgerService.getAdminLedger).toHaveBeenCalledWith(
      'tenant_acme',
    );
    expect(result.profile).toEqual({
      country: 'BO',
      currency: 'BOB',
      rental_type: 'BOTH',
      occupancy_tax_pct: 3,
      accounting_basis: 'cash',
      tax_id: '1234567',
      legal_name: '365Soft SRL',
      tax_regime: 'REGIMEN_GENERAL',
    });
    expect(result.tax_profile).toMatchObject({
      country: 'BO',
      tax_id_label: 'NIT',
      tax_id: '1234567',
      accounting_basis: 'cash',
    });
    expect(result.tax_profile.required_reports).toContain('SIAT / Facturación');
    expect(result.payment_ledger.summary.total_receivable).toBe(1200);
    expect(result.payables.total).toBe(350.5);
    expect(result.payables.count).toBe(2);
    expect(result.payables.data[0]).toMatchObject({
      id: 11,
      vendor_name: 'Proveedor AC',
      property_name: 'Casa Centro',
      amount: 200.25,
      currency: 'BOB',
    });
    expect(result.owners.pending_total).toBe(700);
    expect(result.owners.transferred_total).toBe(1200);
    expect(result.owners.data[0]).toMatchObject({
      id: 21,
      owner_name: 'Dueño Uno',
      net_amount: 700,
      status: 'pending',
    });
    expect(result.banks.total_book_balance).toBe(5000);
    expect(result.banks.unreconciled_transactions).toBe(4);
    expect(result.banks.data[0]).toMatchObject({
      id: 3,
      name: 'Cuenta operativa',
      gl_account_code: '1100',
      book_balance: 5000,
    });
  });
});
