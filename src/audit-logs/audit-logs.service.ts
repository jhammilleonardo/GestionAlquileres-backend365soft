import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditAction } from './enums/audit-action.enum';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { tenantConnectionStore } from '../common/tenant/tenant-connection.store';
import { quoteIdent } from '../common/utils/sql-identifier';

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
  /** Autor. Si se omite, se resuelve del contexto de request (ALS). */
  userId?: number;
  action: AuditAction;
  entityType: string;
  entityId: number;
  oldValues?: Record<string, unknown> | null;
  newValues?: Record<string, unknown> | null;
  /** Si se omiten, se resuelven del contexto de request (ALS). */
  ipAddress?: string | null;
  userAgent?: string | null;
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
    // El actor (id/ip/dispositivo) se captura una vez por request en el
    // TenantConnectionInterceptor; los params explícitos tienen prioridad para
    // los casos que escriben fuera del contexto HTTP (p. ej. login).
    const actor = tenantConnectionStore.getStore()?.actor ?? null;
    const userId = params.userId ?? actor?.userId ?? null;
    const ipAddress = params.ipAddress ?? actor?.ip ?? null;
    const userAgent = params.userAgent ?? actor?.userAgent ?? null;

    if (userId == null) {
      this.logger.warn('Skipping audit log without resolvable user', {
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
      });
      return;
    }

    try {
      await this.dataSource.query(
        `INSERT INTO audit_logs
           (user_id, action, entity_type, entity_id, old_values, new_values, ip_address, user_agent, timestamp)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW())`,
        [
          userId,
          params.action,
          params.entityType,
          params.entityId,
          params.oldValues ? JSON.stringify(params.oldValues) : null,
          params.newValues ? JSON.stringify(params.newValues) : null,
          ipAddress,
          userAgent,
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

  /**
   * Registra contra un schema explícito. Necesario para eventos que ocurren
   * fuera del contexto de tenant (login/logout/reset de contraseña), donde el
   * search_path es `public` y no hay actor en el ALS — IP/dispositivo se pasan
   * explícitos desde el controlador de auth.
   */
  async logForSchema(schemaName: string, params: LogParams): Promise<void> {
    if (params.userId == null) {
      return;
    }
    try {
      await this.dataSource.query(
        `INSERT INTO ${quoteIdent(schemaName)}.audit_logs
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
      this.logger.error('Failed to write audit log (schema-scoped)', {
        schemaName,
        action: params.action,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  /** Máximo de filas exportables de una vez (protege memoria/respuesta). */
  private static readonly EXPORT_MAX_ROWS = 10000;

  async findAll(filters: QueryAuditLogsDto): Promise<AuditLogsPage> {
    const page = Math.max(1, parseInt(filters.page ?? '1', 10));
    const limit = Math.min(
      100,
      Math.max(1, parseInt(filters.limit ?? '20', 10)),
    );
    const offset = (page - 1) * limit;

    const { where, params, nextIdx } = this.buildWhere(filters);

    const [countRows, data] = await Promise.all([
      this.dataSource.query<{ total: string }[]>(
        `SELECT COUNT(*) AS total FROM audit_logs a ${where}`,
        params,
      ),
      this.dataSource.query<AuditLog[]>(
        `${this.SELECT_WITH_LABEL}
           ${where}
           ORDER BY a.timestamp DESC
           LIMIT $${nextIdx} OFFSET $${nextIdx + 1}`,
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

  /** Exporta los registros que matchean los filtros como CSV (sin paginar). */
  async exportCsv(filters: QueryAuditLogsDto): Promise<string> {
    const { where, params, nextIdx } = this.buildWhere(filters);
    const rows = await this.dataSource.query<AuditLog[]>(
      `${this.SELECT_WITH_LABEL}
         ${where}
         ORDER BY a.timestamp DESC
         LIMIT $${nextIdx}`,
      [...params, AuditLogsService.EXPORT_MAX_ROWS],
    );
    return this.toCsv(rows);
  }

  /**
   * Construye la cláusula WHERE compartida por listado y export. Devuelve el
   * próximo índice de parámetro libre para que el caller agregue LIMIT/OFFSET.
   */
  private buildWhere(filters: QueryAuditLogsDto): {
    where: string;
    params: unknown[];
    nextIdx: number;
  } {
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

    return { where, params, nextIdx: idx };
  }

  /**
   * SELECT con resolución de autor y etiqueta legible de la entidad. El LEFT
   * JOIN preserva el registro aunque el usuario haya sido eliminado (el
   * frontend cae al id como respaldo).
   */
  private readonly SELECT_WITH_LABEL = `SELECT a.*, u.name AS user_name, u.email AS user_email, u.role AS user_role,
                CASE a.entity_type
                  WHEN 'employee' THEN (SELECT e.name FROM "user" e WHERE e.id = a.entity_id)
                  WHEN 'auth'     THEN (SELECT au.name FROM "user" au WHERE au.id = a.entity_id)
                  WHEN 'contract' THEN (SELECT c.contract_number FROM contracts c WHERE c.id = a.entity_id)
                  WHEN 'payment'  THEN (
                    SELECT COALESCE(NULLIF(p.reference_number, ''), p.amount::text || ' ' || p.currency)
                      FROM payments p WHERE p.id = a.entity_id
                  )
                  WHEN 'property'     THEN (SELECT pr.title FROM properties pr WHERE pr.id = a.entity_id)
                  WHEN 'rental_owner' THEN (SELECT ro.name FROM rental_owners ro WHERE ro.id = a.entity_id)
                  WHEN 'vendor'       THEN (SELECT v.name FROM vendors v WHERE v.id = a.entity_id)
                  WHEN 'expense'      THEN (
                    SELECT COALESCE(NULLIF(ex.description, ''), ex.vendor_name)
                      FROM expenses ex WHERE ex.id = a.entity_id
                  )
                  WHEN 'violation'    THEN (SELECT vi.type FROM violations vi WHERE vi.id = a.entity_id)
                  WHEN 'inspection'   THEN (SELECT ins.type FROM inspections ins WHERE ins.id = a.entity_id)
                  WHEN 'maintenance'  THEN (SELECT m.ticket_number FROM maintenance_requests m WHERE m.id = a.entity_id)
                  ELSE NULL
                END AS entity_label
           FROM audit_logs a
           LEFT JOIN "user" u ON u.id = a.user_id`;

  /** Serializa filas a CSV (RFC 4180): comillas dobles escapadas, BOM para Excel. */
  private toCsv(rows: AuditLog[]): string {
    const headers = [
      'timestamp',
      'user_name',
      'user_email',
      'user_role',
      'action',
      'entity_type',
      'entity_id',
      'entity_label',
      'ip_address',
      'user_agent',
    ];

    const escape = (value: unknown): string => {
      if (value === null || value === undefined) return '';
      let str: string;
      if (value instanceof Date) {
        str = value.toISOString();
      } else if (typeof value === 'object') {
        str = JSON.stringify(value);
      } else {
        str = String(value as string | number | boolean);
      }
      return `"${str.replace(/"/g, '""')}"`;
    };

    const lines = [headers.join(',')];
    for (const row of rows) {
      const record = row as unknown as Record<string, unknown>;
      lines.push(headers.map((h) => escape(record[h])).join(','));
    }
    // BOM para que Excel detecte UTF-8 correctamente.
    return '\uFEFF' + lines.join('\r\n');
  }
}
