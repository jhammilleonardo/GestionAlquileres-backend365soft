import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditAction } from './enums/audit-action.enum';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';

export interface AuditLog {
  id: number;
  user_id: number;
  user_name: string | null;
  user_email: string | null;
  user_role: string | null;
  action: AuditAction;
  entity_type: string;
  entity_id: number;
  entity_label: string | null;
  old_values: Record<string, unknown> | null;
  new_values: Record<string, unknown> | null;
  ip_address: string | null;
  user_agent: string | null;
  timestamp: Date;
}

export interface LogParams {
  userId: number;
  action: AuditAction;
  entityType: string;
  entityId: number;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  ipAddress?: string;
  userAgent?: string;
}

export interface AuditLogsPage {
  data: AuditLog[];
  total: number;
  page: number;
  limit: number;
}

@Injectable()
export class AuditLogsService {
  private readonly logger = new Logger(AuditLogsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async log(params: LogParams): Promise<void> {
    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs
           (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          params.userId,
          params.action,
          params.entityType,
          params.entityId,
          params.oldValues ? JSON.stringify(params.oldValues) : null,
          params.newValues ? JSON.stringify(params.newValues) : null,
          params.ipAddress ?? null,
          params.userAgent ?? null,
        ],
      );
    } catch (err) {
      this.logger.error('Failed to write audit log', {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  async findAll(filters: QueryAuditLogsDto): Promise<AuditLogsPage> {
    const page = Math.max(1, parseInt(filters.page ?? '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(filters.limit ?? '20', 10)),
    );
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params: unknown[] = [];
    let idx = 1;

    if (filters.user_id) {
      where += ` AND a.user_id = $${idx++}`;
      params.push(parseInt(filters.user_id, 10));
    }
    if (filters.entity_type) {
      where += ` AND a.entity_type = $${idx++}`;
      params.push(filters.entity_type);
    }
    if (filters.entity_id) {
      where += ` AND a.entity_id = $${idx++}`;
      params.push(parseInt(filters.entity_id, 10));
    }
    if (filters.action) {
      where += ` AND a.action = $${idx++}`;
      params.push(filters.action);
    }
    if (filters.from) {
      where += ` AND a.timestamp >= $${idx++}`;
      params.push(filters.from);
    }
    if (filters.to) {
      where += ` AND a.timestamp <= $${idx++}`;
      params.push(filters.to);
    }

    // Se resuelve el autor uniendo con la tabla "user" del tenant para mostrar
    // nombre y rol en lugar de solo el id. LEFT JOIN preserva el registro aunque
    // el usuario haya sido eliminado (el frontend cae al id como respaldo).
    const [countRows, data] = await Promise.all([
      this.dataSource.query<{ total: string }[]>(
        `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
        params,
      ),
      this.dataSource.query<AuditLog[]>(
        `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                CASE a.entity_type
                  WHEN 'employee' THEN (SELECT e.name FROM "user" e WHERE e.id = a.entity_id)
                  WHEN 'contract' THEN (SELECT c.contract_number FROM contracts c WHERE c.id = a.entity_id)
                  WHEN 'payment'  THEN (
                    SELECT COALESCE(NULLIF(p.reference_number, ''), p.amount::text || ' ' || p.currency)
                      FROM payments p WHERE p.id = a.entity_id
                  )
                  ELSE NULL
                END AS entity_label
           FROM audit_logs a
           LEFT JOIN "user" u ON u.id = a.user_id
           ${where}
           ORDER BY a.timestamp DESC
           LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset],
      ),
    ]);

    return {
      data,
      total: parseInt(countRows[0]?.total ?? '0', 10),
      page,
      limit,
    };
  }
}
