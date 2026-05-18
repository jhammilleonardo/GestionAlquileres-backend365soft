import { Test, TestingModule } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { MaintenanceStatsService } from './maintenance-stats.service';

describe('MaintenanceStatsService', () => {
  let service: MaintenanceStatsService;
  let query: jest.Mock;

  beforeEach(async () => {
    query = jest.fn();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        MaintenanceStatsService,
        {
          provide: DataSource,
          useValue: { query },
        },
      ],
    }).compile();

    service = module.get(MaintenanceStatsService);
  });

  it('calcula estadisticas admin sin crear QueryRunner propio', async () => {
    query
      .mockResolvedValueOnce([{ count: '9' }])
      .mockResolvedValueOnce([
        { status: 'NEW', count: '2' },
        { status: 'COMPLETED', count: '3' },
      ])
      .mockResolvedValueOnce([
        { priority: 'NORMAL', count: '7' },
        { priority: 'HIGH', count: '2' },
      ])
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(service.getAdminStats()).resolves.toEqual({
      total: 9,
      byStatus: { NEW: 2, COMPLETED: 3 },
      byPriority: { NORMAL: 7, HIGH: 2 },
      newRequests: 2,
      urgentRequests: 1,
    });
    expect(query).toHaveBeenCalledTimes(5);
  });

  it('calcula estadisticas del inquilino con parametros', async () => {
    query
      .mockResolvedValueOnce([{ count: '4' }])
      .mockResolvedValueOnce([{ count: '2' }])
      .mockResolvedValueOnce([{ count: '1' }]);

    await expect(service.getTenantStats(12)).resolves.toEqual({
      total: 4,
      active: 2,
      completed: 1,
    });
    expect(query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('tenant_id = $1'),
      [12],
    );
  });
});
