import { DataSource } from 'typeorm';
import { PropertyStatsService } from './property-stats.service';

describe('PropertyStatsService', () => {
  let service: PropertyStatsService;
  let dataSource: {
    query: jest.Mock;
  };

  beforeEach(() => {
    dataSource = {
      query: jest.fn(),
    };
    service = new PropertyStatsService(dataSource as unknown as DataSource);
  });

  it('reads stats from an explicit tenant schema and normalizes numbers', async () => {
    dataSource.query.mockResolvedValueOnce([
      {
        total: '5',
        available: '2',
        occupied: '1',
        maintenance: '1',
        reserved: '1',
        inactive: '0',
      },
    ]);

    await expect(service.getStats('tenant_acme')).resolves.toEqual({
      total: 5,
      available: 2,
      occupied: 1,
      maintenance: 1,
      reserved: 1,
      inactive: 0,
    });

    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('FROM "tenant_acme".properties'),
    );
  });
});
