import { Test, TestingModule } from '@nestjs/testing';
import { getDataSourceToken } from '@nestjs/typeorm';
import { ReservationNotificationService } from './reservation-notification.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';

describe('ReservationNotificationService', () => {
  let service: ReservationNotificationService;
  const mockDataSource = { query: jest.fn() };
  const mockNotifications = { createForUserInSchema: jest.fn() };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReservationNotificationService,
        { provide: getDataSourceToken(), useValue: mockDataSource },
        { provide: NotificationsService, useValue: mockNotifications },
      ],
    }).compile();

    service = module.get(ReservationNotificationService);
    jest.resetAllMocks();
  });

  it('notifica a cada admin activo de la solicitud', async () => {
    mockDataSource.query.mockResolvedValueOnce([{ id: 1 }, { id: 2 }]);

    await service.notifyAdminsOfRequest(
      'tenant_acme',
      { id: 9, checkin_date: '2026-06-01', checkout_date: '2026-06-05' },
      'acme',
    );

    expect(mockNotifications.createForUserInSchema).toHaveBeenCalledTimes(2);
    const [, userId, eventType] = mockNotifications.createForUserInSchema.mock
      .calls[0] as unknown[];
    expect(userId).toBe(1);
    expect(eventType).toBe(NotificationEventType.RESERVATION_REQUESTED);
  });

  it('notifica al huésped con el evento indicado', async () => {
    await service.notifyGuest(
      'tenant_acme',
      55,
      NotificationEventType.RESERVATION_CONFIRMED,
      9,
      'acme',
    );

    const call = mockNotifications.createForUserInSchema.mock
      .calls[0] as unknown[];
    expect(call[1]).toBe(55);
    expect(call[2]).toBe(NotificationEventType.RESERVATION_CONFIRMED);
  });

  it('omite la notificación si el huésped no tiene usuario válido', async () => {
    await service.notifyGuest(
      'tenant_acme',
      null,
      NotificationEventType.RESERVATION_EXPIRED,
      9,
      'acme',
    );

    expect(mockNotifications.createForUserInSchema).not.toHaveBeenCalled();
  });

  it('es best-effort: no propaga si la notificación falla', async () => {
    mockNotifications.createForUserInSchema.mockRejectedValueOnce(
      new Error('down'),
    );

    await expect(
      service.notifyGuest(
        'tenant_acme',
        55,
        NotificationEventType.RESERVATION_EXPIRED,
        9,
      ),
    ).resolves.toBeUndefined();
  });
});
