import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, BadRequestException, ConflictException } from '@nestjs/common';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationsService } from './reservations.service';
import { AvailabilityStatus } from './enums/availability-status.enum';

function mockUnit(overrides?: Partial<Record<string, string>>): Record<string, string> {
  return {
    id: '7',
    property_id: '3',
    rental_type: 'SHORT_TERM',
    price_per_night: '80.00',
    cleaning_fee: '20.00',
    currency: 'BOB',
    min_nights: '2',
    max_nights: '30',
    tenant_rental_type: 'BOTH',
    ...overrides,
  };
}

describe('ReservationsService', () => {
  let service: ReservationsService;
  const mockDataSource = { query: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationsService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
      ],
    }).compile();

    service = module.get<ReservationsService>(ReservationsService);
    jest.resetAllMocks();
  });

  // ─── getMonthAvailability ─────────────────────────────────────────────────

  describe('getMonthAvailability', () => {
    it('debe retornar todos los días del mes con estado available por defecto', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getMonthAvailability(3, '2026-05');

      expect(result).toHaveLength(31);
      expect(result[0]).toEqual({ date: '2026-05-01', status: AvailabilityStatus.AVAILABLE });
      expect(result[30]).toEqual({ date: '2026-05-31', status: AvailabilityStatus.AVAILABLE });
    });

    it('debe sobrescribir el estado de días con registros en BD', async () => {
      mockDataSource.query.mockResolvedValueOnce([
        { date: '2026-05-10', status: 'blocked' },
        { date: '2026-05-11', status: 'booked' },
      ]);

      const result = await service.getMonthAvailability(3, '2026-05');

      const may10 = result.find((d) => d.date === '2026-05-10');
      const may11 = result.find((d) => d.date === '2026-05-11');
      const may12 = result.find((d) => d.date === '2026-05-12');

      expect(may10?.status).toBe(AvailabilityStatus.BLOCKED);
      expect(may11?.status).toBe(AvailabilityStatus.BOOKED);
      expect(may12?.status).toBe(AvailabilityStatus.AVAILABLE);
    });

    it('debe lanzar BadRequestException si el formato del mes es incorrecto', async () => {
      await expect(service.getMonthAvailability(3, '05-2026')).rejects.toThrow(BadRequestException);
      await expect(service.getMonthAvailability(3, '2026-13')).rejects.toThrow(BadRequestException);
    });

    it('debe generar 28 días para febrero en año no bisiesto', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      const result = await service.getMonthAvailability(3, '2026-02');

      expect(result).toHaveLength(28);
    });
  });

  // ─── blockDates ───────────────────────────────────────────────────────────

  describe('blockDates', () => {
    it('debe bloquear las fechas indicadas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])   // findUnitOrFail
        .mockResolvedValueOnce([])             // findBookedDates (ninguna booked)
        .mockResolvedValueOnce(null)           // INSERT fecha 1
        .mockResolvedValueOnce(null);          // INSERT fecha 2

      const result = await service.blockDates(3, 7, { dates: ['2026-05-20', '2026-05-21'] }, 1);

      expect(result.blocked).toBe(2);
    });

    it('debe lanzar BadRequestException si la unidad no es SHORT_TERM', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockUnit({ rental_type: 'LONG_TERM' })]);

      await expect(
        service.blockDates(3, 7, { dates: ['2026-05-20'] }, 1),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ConflictException si alguna fecha ya está reservada', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ date: '2026-05-20' }]); // fecha booked

      await expect(
        service.blockDates(3, 7, { dates: ['2026-05-20', '2026-05-21'] }, 1),
      ).rejects.toThrow(ConflictException);
    });

    it('debe lanzar NotFoundException si la unidad no existe', async () => {
      mockDataSource.query.mockResolvedValueOnce([]);

      await expect(
        service.blockDates(3, 999, { dates: ['2026-05-20'] }, 1),
      ).rejects.toThrow(NotFoundException);
    });
  });

  // ─── createReservation ────────────────────────────────────────────────────

  describe('createReservation', () => {
    const dto = {
      property_id: 3,
      unit_id: 7,
      checkin_date: '2099-06-10',
      checkout_date: '2099-06-15',
    };

    it('debe crear una reserva y retornarla', async () => {
      const mockReservation = { id: 1, nights: 5, total_amount: '420.00', status: 'confirmed' };

      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])             // findUnitOrFail
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]) // validateTenantConfig
        .mockResolvedValueOnce([])                       // assertDatesAvailable
        .mockResolvedValueOnce([mockReservation])        // INSERT reservations
        .mockResolvedValue(null);                        // INSERT property_availability (5 noches)

      const result = await service.createReservation(dto, 42);

      expect(result.id).toBe(1);
      expect(result.nights).toBe(5);
    });

    it('debe lanzar BadRequestException si checkout <= checkin', async () => {
      await expect(
        service.createReservation({ ...dto, checkout_date: dto.checkin_date }, 42),
      ).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si la unidad no es SHORT_TERM', async () => {
      mockDataSource.query.mockResolvedValueOnce([mockUnit({ rental_type: 'LONG_TERM' })]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si el tenant solo admite LONG_TERM', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit()])
        .mockResolvedValueOnce([{ rental_type: 'LONG_TERM' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar BadRequestException si no se cumplen las noches mínimas', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '7' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(BadRequestException);
    });

    it('debe lanzar ConflictException si hay fechas no disponibles', async () => {
      mockDataSource.query
        .mockResolvedValueOnce([mockUnit({ min_nights: '1' })])
        .mockResolvedValueOnce([{ rental_type: 'BOTH' }])
        .mockResolvedValueOnce([{ date: '2099-06-10', status: 'blocked' }]);

      await expect(service.createReservation(dto, 42)).rejects.toThrow(ConflictException);
    });
  });
});
