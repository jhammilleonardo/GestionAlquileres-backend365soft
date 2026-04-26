import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { BillingCronService } from './billing-cron.service';
import {
  calculateLateFee,
  isPaymentOverdue,
  isMidnightWindowInTz,
  isFirstDayOfMonthInTz,
  getPreviousMonthYear,
} from './late-fee.calculator';

// ─── Tests de funciones puras (sin DI) ────────────────────────────────────────

describe('calculateLateFee', () => {
  it('aplica el porcentaje correcto sobre el monto', () => {
    expect(calculateLateFee(1000, 5)).toBe(50);
  });

  it('aplica mora del 2% (Bolivia)', () => {
    expect(calculateLateFee(1500, 2)).toBe(30);
  });

  it('aplica mora del 3% (Guatemala / Honduras)', () => {
    expect(calculateLateFee(2000, 3)).toBe(60);
  });

  it('redondea a 2 decimales', () => {
    expect(calculateLateFee(333.33, 5)).toBe(16.67);
  });

  it('retorna 0 si el monto es 0', () => {
    expect(calculateLateFee(0, 5)).toBe(0);
  });

  it('retorna 0 si el porcentaje es 0', () => {
    expect(calculateLateFee(1000, 0)).toBe(0);
  });

  it('retorna 0 si el monto es negativo', () => {
    expect(calculateLateFee(-500, 5)).toBe(0);
  });

  it('retorna 0 si el porcentaje es negativo', () => {
    expect(calculateLateFee(1000, -5)).toBe(0);
  });
});

// ─── Tests de isPaymentOverdue ─────────────────────────────────────────────────

describe('isPaymentOverdue', () => {
  const today = new Date('2025-07-10');

  it('no está vencido si dentro del período de gracia', () => {
    // due: 2025-07-06, grace: 5 días → cutoff 2025-07-11 → hoy (10) <= cutoff
    expect(isPaymentOverdue('2025-07-06', 5, today)).toBe(false);
  });

  it('está vencido cuando supera el período de gracia', () => {
    // due: 2025-07-04, grace: 5 días → cutoff 2025-07-09 → hoy (10) > cutoff
    expect(isPaymentOverdue('2025-07-04', 5, today)).toBe(true);
  });

  it('con 0 días de gracia vence el mismo día del due_date', () => {
    // due: 2025-07-09, grace: 0 → cutoff 2025-07-09 → hoy (10) > cutoff
    expect(isPaymentOverdue('2025-07-09', 0, today)).toBe(true);
  });

  it('con 0 días de gracia NO vence si es el mismo día', () => {
    // due: 2025-07-10 = today → cutoff = today → today NOT > today
    expect(isPaymentOverdue('2025-07-10', 0, today)).toBe(false);
  });

  it('acepta objeto Date como due_date', () => {
    expect(isPaymentOverdue(new Date('2025-07-01'), 5, today)).toBe(true);
  });

  it('no está vencido si due_date es en el futuro', () => {
    expect(isPaymentOverdue('2025-07-20', 5, today)).toBe(false);
  });
});

// ─── Tests de isMidnightWindowInTz ────────────────────────────────────────────

describe('isMidnightWindowInTz', () => {
  it('detecta medianoche en una zona horaria', () => {
    // 2025-07-10T06:00:00Z = 00:00 en America/La_Paz (UTC-4 en invierno boliviano, UTC-4)
    const midnight = new Date('2025-07-10T04:00:00Z');
    expect(isMidnightWindowInTz('America/La_Paz', midnight)).toBe(true);
  });

  it('no activa a otras horas', () => {
    const noon = new Date('2025-07-10T16:00:00Z'); // 12:00 La Paz
    expect(isMidnightWindowInTz('America/La_Paz', noon)).toBe(false);
  });
});

// ─── Tests de isFirstDayOfMonthInTz ───────────────────────────────────────────

describe('isFirstDayOfMonthInTz', () => {
  it('devuelve true el día 1 del mes', () => {
    // 2025-07-01T05:00:00Z = 2025-07-01 01:00 en America/New_York (EDT = UTC-4)
    const firstDay = new Date('2025-07-01T05:00:00Z');
    expect(isFirstDayOfMonthInTz('America/New_York', firstDay)).toBe(true);
  });

  it('devuelve false en otros días', () => {
    const secondDay = new Date('2025-07-02T05:00:00Z');
    expect(isFirstDayOfMonthInTz('America/New_York', secondDay)).toBe(false);
  });
});

// ─── Tests de getPreviousMonthYear ────────────────────────────────────────────

describe('getPreviousMonthYear', () => {
  it('retrocede al mes anterior dentro del mismo año', () => {
    const march = new Date('2025-03-01T05:00:00Z'); // 1 mar 2025 en UTC-4
    const result = getPreviousMonthYear('America/New_York', march);
    expect(result).toEqual({ month: 2, year: 2025 });
  });

  it('retrocede de enero al diciembre del año anterior', () => {
    const january = new Date('2025-01-01T05:00:00Z');
    const result = getPreviousMonthYear('America/New_York', january);
    expect(result).toEqual({ month: 12, year: 2024 });
  });
});

// ─── Tests de BillingCronService (integración con DataSource mock) ─────────────

const mockDataSource = { query: jest.fn() };

describe('BillingCronService', () => {
  let service: BillingCronService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        BillingCronService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<BillingCronService>(BillingCronService);
  });

  afterEach(() => jest.resetAllMocks());

  describe('runDailyBilling', () => {
    it('no procesa tenant si no está en ventana de medianoche', async () => {
      // schema con timezone UTC+12 cuando son las 12:00 UTC → no es medianoche
      mockDataSource.query.mockResolvedValueOnce([
        { schema_name: 'tenant_acme', slug: 'acme' },
      ]);
      mockDataSource.query.mockResolvedValueOnce([
        {
          timezone: 'Pacific/Auckland', // UTC+12 — at 12:00 UTC son las 00:00 NZ
          grace_days_late_fee: 5,
          late_fee_percentage: 5,
          commission_percentage: 10,
          currency: 'USD',
          notification_channels: {
            internal: true,
            email: false,
            whatsapp: false,
          },
        },
      ]);

      // Para este test forzamos que NO sea medianoche mockeando Intl
      // (el scheduler NO invoca el job si la hora no coincide)
      jest.spyOn(Intl, 'DateTimeFormat').mockImplementationOnce(
        () =>
          ({
            format: () => '12',
            formatToParts: () => [{ type: 'hour', value: '12' }],
          }) as unknown as Intl.DateTimeFormat,
      );

      await service.runDailyBilling();

      // Solo las 2 queries (getAllActiveTenants + getConfigForSchema) → no pagos ni notificaciones
      expect(mockDataSource.query).toHaveBeenCalledTimes(2);
    });

    it('omite tenants con late_fee_percentage = 0', async () => {
      // Tenant con timezone America/La_Paz (UTC-4) — forzar medianoche
      const midnight = new Date('2025-07-10T04:00:00Z');
      jest.useFakeTimers({ now: midnight });

      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            timezone: 'America/La_Paz',
            grace_days_late_fee: 5,
            late_fee_percentage: 0, // sin mora
            commission_percentage: 10,
            currency: 'BOB',
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([]); // sendPaymentReminders → upcoming payments

      await service.runDailyBilling();

      const inserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO'),
      );
      expect(inserts.length).toBe(0);

      jest.useRealTimers();
    });

    it('no re-envía recordatorio de pago si ya fue enviado (deduplicación)', async () => {
      const midnight = new Date('2025-07-10T04:00:00Z');
      jest.useFakeTimers({ now: midnight });

      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            timezone: 'America/La_Paz',
            grace_days_late_fee: 5,
            late_fee_percentage: 0,
            commission_percentage: 10,
            currency: 'BOB',
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            id: 10,
            amount: '500',
            currency: 'BOB',
            due_date: '2025-07-17',
            tenant_id: 3,
            contract_id: 1,
            contract_number: 'CTR-001',
            property_title: 'Casa Verde',
          },
        ]) // upcoming payments
        .mockResolvedValueOnce([{ id: 99 }]); // hasBeenSent → ya enviado

      await service.runDailyBilling();

      const inserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO'),
      );
      expect(inserts.length).toBe(0);

      jest.useRealTimers();
    });

    it('continúa con el siguiente tenant si uno falla', async () => {
      const midnight = new Date('2025-07-10T04:00:00Z');
      jest.useFakeTimers({ now: midnight });

      mockDataSource.query
        .mockResolvedValueOnce([
          { schema_name: 'tenant_acme', slug: 'acme' },
          { schema_name: 'tenant_beta', slug: 'beta' },
        ])
        .mockRejectedValueOnce(new Error('DB error acme')) // config acme falla
        .mockResolvedValueOnce([
          {
            timezone: 'America/La_Paz',
            grace_days_late_fee: 5,
            late_fee_percentage: 0,
            commission_percentage: 10,
            currency: 'BOB',
            notification_channels: {
              internal: false,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([]); // overdue payments
      // sendPaymentReminders no corre porque internal = false

      await expect(service.runDailyBilling()).resolves.not.toThrow();

      jest.useRealTimers();
    });
  });

  describe('runMonthlyStatements', () => {
    it('no genera liquidaciones si no hay pagos aprobados el mes anterior', async () => {
      const firstDayMidnight = new Date('2025-08-01T04:00:00Z'); // 1 ago 2025 00:00 La Paz
      jest.useFakeTimers({ now: firstDayMidnight });

      mockDataSource.query
        .mockResolvedValueOnce([{ schema_name: 'tenant_acme', slug: 'acme' }])
        .mockResolvedValueOnce([
          {
            timezone: 'America/La_Paz',
            grace_days_late_fee: 5,
            late_fee_percentage: 5,
            commission_percentage: 10,
            currency: 'BOB',
            notification_channels: {
              internal: true,
              email: false,
              whatsapp: false,
            },
          },
        ])
        .mockResolvedValueOnce([
          {
            property_id: 1,
            contract_id: 1,
            rental_owner_id: 5,
            property_title: 'Casa A',
          },
        ]) // properties
        .mockResolvedValueOnce([{ gross_rent: '0', payment_count: '0' }]); // sin pagos

      await service.runMonthlyStatements();

      const inserts = mockDataSource.query.mock.calls.filter(
        (call: unknown[]) =>
          typeof call[0] === 'string' && call[0].includes('INSERT INTO'),
      );
      expect(inserts.length).toBe(0);

      jest.useRealTimers();
    });
  });
});
