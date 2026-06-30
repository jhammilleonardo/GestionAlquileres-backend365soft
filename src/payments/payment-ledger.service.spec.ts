import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { PaymentLedgerService } from './payment-ledger.service';
import { PaymentStatus, PaymentType } from './enums';

describe('PaymentLedgerService', () => {
  let service: PaymentLedgerService;
  let dataSource: { query: jest.Mock };

  beforeEach(async () => {
    dataSource = { query: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PaymentLedgerService,
        {
          provide: DataSource,
          useValue: dataSource,
        },
      ],
    }).compile();

    service = module.get(PaymentLedgerService);
  });

  it('calcula deuda, mora proyectada y pagos aplicados en contratos largo plazo', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 7,
          contract_number: 'CTR-7',
          tenant_id: 1,
          tenant_name: 'Luis Rojas',
          property_id: 2,
          property_title: 'Depto Centro',
          start_date: '2026-01-01',
          end_date: '2026-03-31',
          duration_months: 3,
          monthly_rent: '1000',
          currency: 'BOB',
          payment_day: 5,
          late_fee_percentage: 2,
          grace_days: 5,
          status: 'ACTIVO',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 1,
          contract_id: 7,
          reservation_id: null,
          amount: '1000',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-01-01',
          due_date: '2026-01-05',
          parent_payment_id: null,
          total_refunded: '0',
        },
      ]);

    const ledger = await service.getAdminLedger('tenant_acme');

    expect(ledger.long_term[0].paid_months).toBe(1);
    expect(ledger.long_term[0].base_debt).toBe(2000);
    expect(ledger.long_term[0].late_fee_debt).toBe(40);
    expect(ledger.summary.long_term_debt).toBe(2040);
  });

  it('mantiene separado dinero cobrado y dinero en revisión en contratos largo plazo', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 11,
          contract_number: 'CTR-11',
          tenant_id: 8,
          tenant_name: 'Marco Silva',
          property_id: 6,
          property_title: 'Monoambiente Sur',
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          duration_months: 1,
          monthly_rent: '1000',
          currency: 'BOB',
          payment_day: 5,
          late_fee_percentage: 0,
          grace_days: 0,
          status: 'ACTIVO',
        },
      ])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 30,
          contract_id: 11,
          reservation_id: null,
          amount: '600',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-01-04',
          due_date: '2026-01-05',
          parent_payment_id: null,
          total_refunded: '0',
        },
        {
          id: 31,
          contract_id: 11,
          reservation_id: null,
          amount: '300',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.PENDING,
          payment_date: '2026-01-05',
          due_date: '2026-01-05',
          parent_payment_id: null,
          total_refunded: '0',
        },
      ]);

    const ledger = await service.getAdminLedger('tenant_acme');
    const month = ledger.long_term[0].months[0];

    expect(month.paid_rent).toBe(600);
    expect(month.pending_review).toBe(300);
    expect(month.outstanding_rent).toBe(400);
    expect(month.total_due).toBe(400);
    expect(month.status).toBe('partial');
    expect(ledger.long_term[0].total_pending_review).toBe(300);
    expect(ledger.summary.total_receivable).toBe(400);
  });

  it('no genera saldos negativos si hay sobrepago o reembolso mayor al pago original', async () => {
    dataSource.query
      .mockResolvedValueOnce([
        {
          id: 12,
          contract_number: 'CTR-12',
          tenant_id: 9,
          tenant_name: 'Carla Soto',
          property_id: 7,
          property_title: 'Casa Este',
          start_date: '2026-01-01',
          end_date: '2026-01-31',
          duration_months: 1,
          monthly_rent: '1000',
          currency: 'BOB',
          payment_day: 5,
          late_fee_percentage: 0,
          grace_days: 0,
          status: 'ACTIVO',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 15,
          tenant_id: 10,
          tenant_name: 'Huésped Test',
          property_id: 8,
          property_title: 'Studio Norte',
          unit_number: 'A1',
          checkin_date: '2026-07-01',
          checkout_date: '2026-07-03',
          nights: 2,
          price_per_night: '100',
          cleaning_fee: '20',
          security_deposit: '0',
          deposit_required: '50',
          total_amount: '220',
          currency: 'BOB',
          status: 'confirmed',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 40,
          contract_id: 12,
          reservation_id: null,
          amount: '1300',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-01-04',
          due_date: '2026-01-05',
          parent_payment_id: null,
          total_refunded: '0',
        },
        {
          id: 41,
          contract_id: null,
          reservation_id: 15,
          amount: '100',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-06-01',
          due_date: null,
          parent_payment_id: null,
          total_refunded: '150',
        },
      ]);

    const ledger = await service.getAdminLedger('tenant_acme');
    const longTermMonth = ledger.long_term[0].months[0];
    const shortTerm = ledger.short_term[0];

    expect(longTermMonth.paid_rent).toBe(1000);
    expect(longTermMonth.outstanding_rent).toBe(0);
    expect(longTermMonth.total_due).toBe(0);
    expect(ledger.long_term[0].total_debt).toBe(0);

    expect(shortTerm.paid_amount).toBe(0);
    expect(shortTerm.refunded_amount).toBe(150);
    expect(shortTerm.balance_due).toBe(220);
    expect(shortTerm.deposit_due).toBe(50);
    expect(ledger.summary.total_receivable).toBe(220);
  });

  it('calcula saldo de reservas corto plazo con pagos netos y reembolsos', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 9,
          tenant_id: 3,
          tenant_name: 'Ana Paz',
          property_id: 4,
          property_title: 'Casa Norte',
          unit_number: '2A',
          checkin_date: '2026-07-01',
          checkout_date: '2026-07-04',
          nights: 3,
          price_per_night: '100',
          cleaning_fee: '20',
          security_deposit: '50',
          deposit_required: '120',
          total_amount: '370',
          currency: 'BOB',
          status: 'confirmed',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 20,
          contract_id: null,
          reservation_id: 9,
          amount: '150',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-06-01',
          due_date: null,
          parent_payment_id: null,
          total_refunded: '30',
        },
        {
          id: 21,
          contract_id: null,
          reservation_id: 9,
          amount: '50',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.PENDING,
          payment_date: '2026-06-02',
          due_date: null,
          parent_payment_id: null,
          total_refunded: '0',
        },
      ]);

    const ledger = await service.getAdminLedger('tenant_acme');

    expect(ledger.short_term[0].paid_amount).toBe(120);
    expect(ledger.short_term[0].refunded_amount).toBe(30);
    expect(ledger.short_term[0].pending_review).toBe(50);
    expect(ledger.short_term[0].balance_due).toBe(250);
    expect(ledger.summary.short_term_balance_due).toBe(250);
  });

  it('cierra saldo de reserva sin volverlo negativo cuando existe sobrepago histórico', async () => {
    dataSource.query
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: 16,
          tenant_id: 4,
          tenant_name: 'Eva Luna',
          property_id: 5,
          property_title: 'Loft Centro',
          unit_number: null,
          checkin_date: '2026-07-10',
          checkout_date: '2026-07-12',
          nights: 2,
          price_per_night: '100',
          cleaning_fee: '20',
          security_deposit: '0',
          deposit_required: '80',
          total_amount: '220',
          currency: 'BOB',
          status: 'confirmed',
        },
      ])
      .mockResolvedValueOnce([
        {
          id: 50,
          contract_id: null,
          reservation_id: 16,
          amount: '300',
          currency: 'BOB',
          payment_type: PaymentType.RENT,
          status: PaymentStatus.APPROVED,
          payment_date: '2026-06-20',
          due_date: null,
          parent_payment_id: null,
          total_refunded: '0',
        },
      ]);

    const ledger = await service.getAdminLedger('tenant_acme');

    expect(ledger.short_term[0].paid_amount).toBe(300);
    expect(ledger.short_term[0].balance_due).toBe(0);
    expect(ledger.short_term[0].deposit_due).toBe(0);
    expect(ledger.summary.short_term_balance_due).toBe(0);
    expect(ledger.summary.total_receivable).toBe(0);
  });
});
