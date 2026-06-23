import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../../common/utils/sql-identifier';
import { parseIcalendar, BusyRange } from './ical-parser';
import { SafeHttpClientService } from '../../common/http/safe-http-client.service';

export interface CreateSyncSourceDto {
  name: string;
  url: string;
}

interface SyncSourceRow {
  id: number;
  unit_id: number;
  url: string;
  property_id: number;
}

/**
 * Importa calendarios externos (iCal) y bloquea las fechas ocupadas. Todas las
 * consultas se califican con el schema del tenant, porque el servicio corre
 * tanto en contexto de request (admin) como en el cron (sin `search_path`).
 */
@Injectable()
export class CalendarSyncService {
  private readonly logger = new Logger(CalendarSyncService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly safeHttp: SafeHttpClientService,
  ) {}

  // ─── CRUD ─────────────────────────────────────────────────────────────────

  async createSource(
    schemaName: string,
    unitId: number,
    dto: CreateSyncSourceDto,
  ): Promise<unknown> {
    const q = quoteIdent(schemaName);
    const rows = await this.dataSource.query<unknown[]>(
      `INSERT INTO ${q}.calendar_sync_sources (unit_id, name, url)
       VALUES ($1, $2, $3) RETURNING *`,
      [unitId, dto.name, dto.url],
    );
    return rows[0];
  }

  async listSources(schemaName: string, unitId: number): Promise<unknown[]> {
    const q = quoteIdent(schemaName);
    return this.dataSource.query(
      `SELECT * FROM ${q}.calendar_sync_sources
        WHERE unit_id = $1 ORDER BY id`,
      [unitId],
    );
  }

  async removeSource(
    schemaName: string,
    unitId: number,
    id: number,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    // Libera los bloqueos importados por esta fuente antes de borrarla.
    await this.releaseBlocks(schemaName, id);
    const deleted = await this.dataSource.query<Array<{ id: number }>>(
      `DELETE FROM ${q}.calendar_sync_sources
        WHERE id = $1 AND unit_id = $2 RETURNING id`,
      [id, unitId],
    );
    if (deleted.length === 0) {
      throw new NotFoundException(`Fuente de calendario ${id} no encontrada`);
    }
  }

  // ─── Sincronización ─────────────────────────────────────────────────────────

  /** Sincroniza una fuente: descarga, parsea y aplica los bloqueos. */
  async syncSource(schemaName: string, sourceId: number): Promise<number> {
    const source = await this.findSource(schemaName, sourceId);
    const ics = await this.fetchIcs(source.url);
    const ranges = parseIcalendar(ics);
    const blocked = await this.applyRanges(schemaName, source, ranges);
    await this.markSynced(schemaName, sourceId);
    return blocked;
  }

  /** Recorre todos los tenants activos y sincroniza sus fuentes (cron). */
  async syncAllTenants(): Promise<void> {
    const tenants = await this.dataSource.query<Array<{ schema_name: string }>>(
      `SELECT t.schema_name FROM public.tenant t
        WHERE t.is_active = true
          AND EXISTS (
            SELECT 1 FROM information_schema.tables tb
            WHERE tb.table_schema = t.schema_name
              AND tb.table_name = 'calendar_sync_sources'
          )`,
    );

    for (const tenant of tenants) {
      const q = quoteIdent(tenant.schema_name);
      const sources = await this.dataSource.query<Array<{ id: number }>>(
        `SELECT id FROM ${q}.calendar_sync_sources`,
      );
      for (const source of sources) {
        try {
          await this.syncSource(tenant.schema_name, source.id);
        } catch (error) {
          this.logger.warn(
            `Fallo al sincronizar fuente ${source.id} en ${tenant.schema_name}: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
        }
      }
    }
  }

  // ─── Helpers ──────────────────────────────────────────────────────────────

  private async findSource(
    schemaName: string,
    sourceId: number,
  ): Promise<SyncSourceRow> {
    const q = quoteIdent(schemaName);
    const rows = await this.dataSource.query<SyncSourceRow[]>(
      `SELECT s.id, s.unit_id, s.url, u.property_id
         FROM ${q}.calendar_sync_sources s
         JOIN ${q}.units u ON u.id = s.unit_id
        WHERE s.id = $1`,
      [sourceId],
    );
    if (rows.length === 0) {
      throw new NotFoundException(
        `Fuente de calendario ${sourceId} no encontrada`,
      );
    }
    return rows[0];
  }

  private async fetchIcs(url: string): Promise<string> {
    return this.safeHttp.getCalendarText(url);
  }

  /**
   * Aplica los rangos ocupados como bloqueos: primero libera los bloqueos previos
   * de esta fuente (idempotencia), luego bloquea cada noche que esté `available`
   * (sin pisar reservas reales). Devuelve la cantidad de noches bloqueadas.
   */
  private async applyRanges(
    schemaName: string,
    source: SyncSourceRow,
    ranges: BusyRange[],
  ): Promise<number> {
    await this.releaseBlocks(schemaName, source.id);

    const q = quoteIdent(schemaName);
    let blocked = 0;
    for (const range of ranges) {
      const inserted = await this.dataSource.query<Array<{ date: string }>>(
        `INSERT INTO ${q}.property_availability
           (property_id, unit_id, date, status, sync_source_id)
         SELECT $1, $2, d::date, 'blocked', $5
           FROM generate_series($3::date, $4::date - 1, '1 day') d
         ON CONFLICT (unit_id, date) DO UPDATE
           SET status = 'blocked', sync_source_id = $5
           WHERE ${q}.property_availability.status = 'available'
         RETURNING date::text`,
        [source.property_id, source.unit_id, range.start, range.end, source.id],
      );
      blocked += inserted.length;
    }
    return blocked;
  }

  private async releaseBlocks(
    schemaName: string,
    sourceId: number,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    await this.dataSource.query(
      `UPDATE ${q}.property_availability
          SET status = 'available', sync_source_id = NULL
        WHERE sync_source_id = $1 AND status = 'blocked'`,
      [sourceId],
    );
  }

  private async markSynced(
    schemaName: string,
    sourceId: number,
  ): Promise<void> {
    const q = quoteIdent(schemaName);
    await this.dataSource.query(
      `UPDATE ${q}.calendar_sync_sources
          SET last_synced_at = NOW() WHERE id = $1`,
      [sourceId],
    );
  }
}
