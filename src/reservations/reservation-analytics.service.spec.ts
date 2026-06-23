import { Test, TestingModule } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationAnalyticsService } from './reservation-analytics.service';

describe('ReservationAnalyticsService', () => {
  let service: ReservationAnalyticsService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationAnalyticsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get(ReservationAnalyticsService);
    jest.resetAllMocks();
  });

  it('calcula ocupación, ingresos y ADR del rango', async () => {
    // 4 consultas en paralelo: units, booked, revenue, byStatus
    mockDataSource.query
      .mockResolvedValueOnce([{ count: 2 }]) // 2 unidades de corto plazo
      .mockResolvedValueOnce([{ count: 15 }]) // 15 noches reservadas
      .mockResolvedValueOnce([{ amount: 1200, currency: 'BOB' }]) // ingresos
      .mockResolvedValueOnce([
        { status: 'completed', count: 3 },
        { status: 'confirmed', count: 1 },
      ]);

    // rango 2026-06-01..2026-06-10 = 10 noches; capacidad 2×10 = 20
    const result = await service.getOverview({
      from: '2026-06-01',
      to: '2026-06-10',
    });

    expect(result.range_nights).toBe(10);
    expect(result.available_nights).toBe(20);
    expect(result.booked_nights).toBe(15);
    expect(result.occupancy_rate).toBe(0.75); // 15/20
    expect(result.revenue).toBe(1200);
    expect(result.adr).toBe(80); // 1200/15
    expect(result.reservations_by_status).toEqual({
      completed: 3,
      confirmed: 1,
    });
  });

  it('ocupación y ADR son 0 sin capacidad ni noches', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ count: 0 }])
      .mockResolvedValueOnce([{ amount: 0, currency: 'USD' }])
      .mockResolvedValueOnce([]);

    const result = await service.getOverview({
      from: '2026-06-01',
      to: '2026-06-10',
    });

    expect(result.occupancy_rate).toBe(0);
    expect(result.adr).toBe(0);
    expect(result.reservations_by_status).toEqual({});
  });

  it('rechaza un rango invertido', async () => {
    await expect(
      service.getOverview({ from: '2026-06-10', to: '2026-06-01' }),
    ).rejects.toThrow(BadRequestException);
  });
});
