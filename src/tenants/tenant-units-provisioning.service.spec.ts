import { DataSource } from 'typeorm';
import { TenantUnitsProvisioningService } from './tenant-units-provisioning.service';

describe('TenantUnitsProvisioningService', () => {
  let dataSource: Pick<DataSource, 'query'>;
  let service: TenantUnitsProvisioningService;

  beforeEach(() => {
    dataSource = {
      query: jest.fn().mockResolvedValue([]),
    } as unknown as Pick<DataSource, 'query'>;
    service = new TenantUnitsProvisioningService(dataSource as DataSource);
  });

  it('creates the reservation overlap constraint idempotently', async () => {
    await service.ensureReservationOverlapGuard('tenant_alpha');

    expect(dataSource.query).toHaveBeenCalledTimes(1);
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('IF NOT EXISTS'),
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining("n.nspname = 'tenant_alpha'"),
    );
    expect(dataSource.query).toHaveBeenCalledWith(
      expect.stringContaining('excl_reservations_no_overlap_v2'),
    );
  });
});
