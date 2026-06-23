import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationExpiryService } from './reservation-expiry.service';
import { ReservationNotificationService } from './reservation-notification.service';

describe('ReservationExpiryService', () => {
  let service: ReservationExpiryService;
  const mockDataSource = { query: jest.fn() };
  const mockNotification = { notifyGuest: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationExpiryService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        {
          provide: ReservationNotificationService,
          useValue: mockNotification,
        },
      ],
    }).compile();

    service = module.get(ReservationExpiryService);
    jest.resetAllMocks();
  });

  it('expira reservas vencidas, cuenta únicas y notifica a cada huésped', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_a', slug: 'a' }]) // tenants activos
      // CTE: dos noches de la reserva 5 y una de la 6 → 2 reservas únicas
      .mockResolvedValueOnce([
        { id: 5, tenant_id: 100 },
        { id: 5, tenant_id: 100 },
        { id: 6, tenant_id: 200 },
      ]);

    const total = await service.expireStalePendingReservations();

    expect(total).toBe(2);
    expect(mockNotification.notifyGuest).toHaveBeenCalledTimes(2);
  });

  it('continúa con otros tenants si uno falla', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([
        { schema_name: 'tenant_a', slug: 'a' },
        { schema_name: 'tenant_b', slug: 'b' },
      ])
      .mockRejectedValueOnce(new Error('boom')) // tenant_a falla
      .mockResolvedValueOnce([{ id: 9, tenant_id: 300 }]); // tenant_b expira 1

    const total = await service.expireStalePendingReservations();

    expect(total).toBe(1);
  });

  it('no expira nada si no hay reservas vencidas', async () => {
    mockDataSource.query
      .mockResolvedValueOnce([{ schema_name: 'tenant_a', slug: 'a' }])
      .mockResolvedValueOnce([]);

    const total = await service.expireStalePendingReservations();

    expect(total).toBe(0);
    expect(mockNotification.notifyGuest).not.toHaveBeenCalled();
  });
});
