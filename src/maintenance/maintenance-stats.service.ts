import { Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type {
  CountByPriorityRow,
  CountByStatusRow,
  CountRow,
  MaintenanceStats,
  TenantMaintenanceStats,
} from './maintenance.types';

@Injectable()
export class MaintenanceStatsService {
  constructor(private readonly dataSource: DataSource) {}

  async getAdminStats(): Promise<MaintenanceStats> {
    const [
      totalResult,
      byStatusResult,
      byPriorityResult,
      newResult,
      urgentResult,
    ] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests`,
      ),
      this.dataSource.query<CountByStatusRow[]>(
        `SELECT status, COUNT(*) as count FROM maintenance_requests GROUP BY status`,
      ),
      this.dataSource.query<CountByPriorityRow[]>(
        `SELECT priority, COUNT(*) as count FROM maintenance_requests GROUP BY priority`,
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE status = 'NEW'`,
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE priority = 'HIGH' AND status = 'IN_PROGRESS'`,
      ),
    ]);

    const byStatus = byStatusResult.reduce<MaintenanceStats['byStatus']>(
      (acc, item) => {
        acc[item.status] = Number(item.count);
        return acc;
      },
      {},
    );

    const byPriority = byPriorityResult.reduce<MaintenanceStats['byPriority']>(
      (acc, item) => {
        acc[item.priority] = Number(item.count);
        return acc;
      },
      {},
    );

    return {
      total: Number(totalResult[0]?.count ?? 0),
      byStatus,
      byPriority,
      newRequests: Number(newResult[0]?.count ?? 0),
      urgentRequests: Number(urgentResult[0]?.count ?? 0),
    };
  }

  async getTenantStats(tenantId: number): Promise<TenantMaintenanceStats> {
    const [totalResult, activeResult, completedResult] = await Promise.all([
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1`,
        [tenantId],
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1 AND status = 'IN_PROGRESS'`,
        [tenantId],
      ),
      this.dataSource.query<CountRow[]>(
        `SELECT COUNT(*) as count FROM maintenance_requests WHERE tenant_id = $1 AND status = 'COMPLETED'`,
        [tenantId],
      ),
    ]);

    return {
      total: Number(totalResult[0]?.count ?? 0),
      active: Number(activeResult[0]?.count ?? 0),
      completed: Number(completedResult[0]?.count ?? 0),
    };
  }
}
