import { AccountingReportsService } from './accounting-reports.service';

describe('AccountingReportsService', () => {
  let service: AccountingReportsService;
  let dataSource: { query: jest.Mock };
  let tenantsService: { findBySlug: jest.Mock };

  beforeEach(() => {
    dataSource = { query: jest.fn() };
    tenantsService = {
      findBySlug: jest.fn().mockResolvedValue({ schema_name: 'tenant_acme' }),
    };
    service = new AccountingReportsService(
      dataSource as never,
      tenantsService as never,
    );
  });

  describe('getTrialBalance', () => {
    it('coloca el neto en la columna correcta y cuadra débito = crédito', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          code: '1100',
          name: 'Bank',
          type: 'asset',
          debit: '1000',
          credit: '200',
        },
        {
          code: '4000',
          name: 'Rent',
          type: 'income',
          debit: '0',
          credit: '800',
        },
      ]);

      const result = await service.getTrialBalance('acme');

      const bank = result.rows.find((r) => r.code === '1100');
      const rent = result.rows.find((r) => r.code === '4000');
      expect(bank).toMatchObject({ debit: 800, credit: 0 });
      expect(rent).toMatchObject({ debit: 0, credit: 800 });
      expect(result.total_debit).toBe(800);
      expect(result.total_credit).toBe(800);
      expect(result.balanced).toBe(true);
    });
  });

  describe('getIncomeStatement', () => {
    it('calcula ingresos, gastos y resultado neto', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          code: '4000',
          name: 'Rent',
          type: 'income',
          debit: '0',
          credit: '800',
        },
        {
          code: '5200',
          name: 'Maint',
          type: 'expense',
          debit: '300',
          credit: '0',
        },
      ]);

      const result = await service.getIncomeStatement('acme');

      expect(result.total_income).toBe(800);
      expect(result.total_expenses).toBe(300);
      expect(result.net_income).toBe(500);
    });
  });

  describe('getBalanceSheet', () => {
    it('cumple Activo = Pasivo + Patrimonio (incluyendo resultado del ejercicio)', async () => {
      dataSource.query.mockResolvedValueOnce([
        {
          code: '1100',
          name: 'Bank',
          type: 'asset',
          debit: '1000',
          credit: '0',
        },
        {
          code: '2200',
          name: 'Deposits',
          type: 'liability',
          debit: '0',
          credit: '500',
        },
        {
          code: '4000',
          name: 'Rent',
          type: 'income',
          debit: '0',
          credit: '800',
        },
        {
          code: '5200',
          name: 'Maint',
          type: 'expense',
          debit: '300',
          credit: '0',
        },
      ]);

      const result = await service.getBalanceSheet('acme', {
        asOf: '2026-12-31',
      });

      expect(result.total_assets).toBe(1000);
      expect(result.total_liabilities).toBe(500);
      expect(result.net_income).toBe(500);
      // Patrimonio = 0 booked + 500 resultado del ejercicio.
      expect(result.total_equity).toBe(500);
      expect(result.balanced).toBe(true);
    });
  });

  describe('getGeneralLedger', () => {
    it('acumula saldo corriente según la naturaleza de la cuenta (activo = deudor)', async () => {
      dataSource.query
        .mockResolvedValueOnce([
          { id: 7, code: '1100', name: 'Bank', type: 'asset' },
        ]) // lookup de cuenta
        .mockResolvedValueOnce([
          {
            entry_number: 'JE-1',
            entry_date: '2026-01-05',
            description: 'Cobro',
            debit: '100',
            credit: '0',
            memo: null,
          },
          {
            entry_number: 'JE-2',
            entry_date: '2026-01-06',
            description: 'Pago',
            debit: '0',
            credit: '30',
            memo: null,
          },
        ]); // movimientos (sin `from`, no hay query de apertura)

      const result = await service.getGeneralLedger('acme', {
        accountCode: '1100',
      });

      expect(result.opening_balance).toBe(0);
      expect(result.lines[0].balance).toBe(100);
      expect(result.lines[1].balance).toBe(70);
      expect(result.closing_balance).toBe(70);
    });

    it('devuelve vacío si la cuenta no existe', async () => {
      dataSource.query.mockResolvedValueOnce([]);

      const result = await service.getGeneralLedger('acme', {
        accountCode: '9999',
      });

      expect(result.lines).toEqual([]);
      expect(result.closing_balance).toBe(0);
    });
  });
});
