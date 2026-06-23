import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { QuoteService } from './quote.service';

function mockUnit(overrides?: Record<string, string | null>) {
  return {
    property_id: '3',
    rental_type: 'SHORT_TERM',
    price_per_night: '80.00',
    cleaning_fee: '20.00',
    min_nights: '2',
    max_nights: '30',
    weekly_discount_pct: null,
    monthly_discount_pct: null,
    currency: 'BOB',
    tenant_rental_type: 'BOTH',
    occupancy_tax_pct: null,
    deposit_amount: null,
    ...overrides,
  };
}

describe('QuoteService', () => {
  let service: QuoteService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        QuoteService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<QuoteService>(QuoteService);
    jest.resetAllMocks();
    // Por defecto, sin temporadas (findSeasons). Cada test sobreescribe la
    // primera consulta (findUnitPricing) con mockResolvedValueOnce.
    mockDataSource.query.mockResolvedValue([]);
  });

  it('calcula el desglose base (noches × precio + limpieza)', async () => {
    mockDataSource.query.mockResolvedValueOnce([mockUnit()]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-10',
      checkout_date: '2026-06-15',
    });

    expect(quote.nights).toBe(5);
    expect(quote.subtotal).toBe(420); // 80*5 + 20
    expect(quote.discount_total).toBe(0);
    expect(quote.total).toBe(420);
    expect(quote.lines).toHaveLength(2); // nightly + cleaning
  });

  it('aplica descuento semanal en estadías de 7+ noches', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({ weekly_discount_pct: '10.00' }),
    ]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-01',
      checkout_date: '2026-06-08', // 7 noches
    });

    // base 80*7 = 560; descuento 10% = -56; limpieza 20 → total 524
    expect(quote.nights).toBe(7);
    expect(quote.discount_total).toBe(-56);
    expect(quote.total).toBe(524);
    const discount = quote.lines.find((l) => l.concept === 'weekly_discount');
    expect(discount?.amount).toBe(-56);
  });

  it('prioriza descuento mensual sobre semanal en 28+ noches', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({
        max_nights: '60',
        weekly_discount_pct: '10.00',
        monthly_discount_pct: '25.00',
      }),
    ]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-01',
      checkout_date: '2026-06-29', // 28 noches
    });

    const monthly = quote.lines.find((l) => l.concept === 'monthly_discount');
    expect(monthly).toBeDefined();
    expect(
      quote.lines.find((l) => l.concept === 'weekly_discount'),
    ).toBeUndefined();
    // base 80*28 = 2240; -25% = -560
    expect(quote.discount_total).toBe(-560);
  });

  it('aplica el impuesto de ocupación sobre el alojamiento neto', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({ occupancy_tax_pct: '5.00' }),
    ]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-10',
      checkout_date: '2026-06-15', // 5 noches
    });

    // base 80*5=400; impuesto 5% sobre 400 = 20; limpieza 20 → total 440
    expect(quote.tax_total).toBe(20);
    expect(quote.total).toBe(440);
    const taxLine = quote.lines.find((l) => l.concept === 'occupancy_tax');
    expect(taxLine?.amount).toBe(20);
  });

  it('grava el alojamiento ya descontado, no la base bruta', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({ weekly_discount_pct: '10.00', occupancy_tax_pct: '10.00' }),
    ]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-01',
      checkout_date: '2026-06-08', // 7 noches → descuento semanal
    });

    // base 560; -10% = -56; neto 504; impuesto 10% sobre 504 = 50.4
    expect(quote.tax_total).toBe(50.4);
  });

  it('expone el depósito aparte y lo suma a total_due', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({ deposit_amount: '150.00' }),
    ]);

    const quote = await service.getQuote(3, 7, {
      checkin_date: '2026-06-10',
      checkout_date: '2026-06-15', // 5 noches
    });

    // alojamiento = 80*5 + 20 = 420; depósito 150; total_due = 570
    expect(quote.total).toBe(420);
    expect(quote.deposit).toBe(150);
    expect(quote.total_due).toBe(570);
    expect(
      quote.lines.find((l) => l.concept === 'security_deposit')?.amount,
    ).toBe(150);
  });

  it('lanza NotFoundException si la unidad no existe', async () => {
    mockDataSource.query.mockResolvedValueOnce([]);

    await expect(
      service.getQuote(3, 999, {
        checkin_date: '2026-06-10',
        checkout_date: '2026-06-12',
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('lanza BadRequestException si la unidad no es de corto plazo', async () => {
    mockDataSource.query.mockResolvedValueOnce([
      mockUnit({ rental_type: 'LONG_TERM' }),
    ]);

    await expect(
      service.getQuote(3, 7, {
        checkin_date: '2026-06-10',
        checkout_date: '2026-06-12',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza BadRequestException si checkout <= checkin', async () => {
    await expect(
      service.getQuote(3, 7, {
        checkin_date: '2026-06-10',
        checkout_date: '2026-06-10',
      }),
    ).rejects.toThrow(BadRequestException);
  });

  it('lanza BadRequestException si no cumple noches mínimas', async () => {
    mockDataSource.query.mockResolvedValueOnce([mockUnit({ min_nights: '5' })]);

    await expect(
      service.getQuote(3, 7, {
        checkin_date: '2026-06-10',
        checkout_date: '2026-06-12', // 2 noches < 5
      }),
    ).rejects.toThrow(BadRequestException);
  });
});
