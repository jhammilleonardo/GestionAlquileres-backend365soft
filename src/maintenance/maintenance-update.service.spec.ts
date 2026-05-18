import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { MaintenanceLookupService } from './maintenance-lookup.service';
import { MaintenanceUpdateService } from './maintenance-update.service';

describe('MaintenanceUpdateService', () => {
  let service: MaintenanceUpdateService;
  let query: jest.Mock;
  let lookupService: { findOne: jest.Mock };
  let notificationsService: { createForUser: jest.Mock };

  beforeEach(async () => {
    query = jest.fn();
    lookupService = { findOne: jest.fn() };
    notificationsService = { createForUser: jest.fn() };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceUpdateService,
        {
          provide: DataSource,
          useValue: { query },
        },
        {
          provide: NotificationsService,
          useValue: notificationsService,
        },
        {
          provide: MaintenanceLookupService,
          useValue: lookupService,
        },
      ],
    }).compile();

    service = module.get(MaintenanceUpdateService);
  });

  it('retorna la solicitud sin actualizar si no hay cambios permitidos', async () => {
    lookupService.findOne
      .mockResolvedValueOnce({ id: 1, status: 'NEW', assigned_to: null })
      .mockResolvedValueOnce({ id: 1, status: 'NEW' });

    await expect(service.update(1, {})).resolves.toEqual({
      id: 1,
      status: 'NEW',
    });
    expect(query).not.toHaveBeenCalled();
  });

  it('actualiza columnas permitidas y notifica cambio de estado', async () => {
    lookupService.findOne
      .mockResolvedValueOnce({
        id: 1,
        status: 'NEW',
        assigned_to: null,
        tenant_id: 10,
        ticket_number: 'MNT-1',
        contract_id: 5,
        property: { title: 'Casa' },
        priority: 'NORMAL',
      })
      .mockResolvedValueOnce({ id: 1, status: 'COMPLETED' });
    query.mockResolvedValueOnce([]);

    await expect(service.update(1, { status: 'COMPLETED' })).resolves.toEqual({
      id: 1,
      status: 'COMPLETED',
    });

    expect(query).toHaveBeenCalledWith(
      expect.stringContaining('UPDATE maintenance_requests'),
      ['COMPLETED', 1],
    );
    expect(notificationsService.createForUser).toHaveBeenCalledWith(
      10,
      expect.any(String),
      expect.any(String),
      expect.stringContaining('MNT-1'),
      expect.objectContaining({ new_status: 'COMPLETED' }),
    );
  });
});
