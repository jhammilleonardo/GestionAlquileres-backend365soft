import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { StorageService } from '../common/storage/storage.service';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import {
  ViolationsPdfService,
  ViolationPdfData,
} from './violations-pdf.service';
import {
  CLOSED_VIOLATION_STATUSES,
  ViolationStatusEnum,
} from './enums/violation-status.enum';
import { ViolationSeverityEnum } from './enums/violation-severity.enum';
import { ViolationFineStatusEnum } from './enums/violation-fine-status.enum';
import { ViolationEventTypeEnum } from './enums/violation-event-type.enum';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import {
  AddViolationNoteDto,
  ChargeFineDto,
  CreateViolationDto,
  UpdateViolationStatusDto,
  ViolationFiltersDto,
} from './dto';

export interface ViolationRow {
  id: number;
  property_id: number;
  unit_id: number | null;
  tenant_id: number;
  type: string;
  severity: ViolationSeverityEnum;
  description: string;
  status: ViolationStatusEnum;
  due_date: string | null;
  evidence_photos: string[];
  fine_amount: number | null;
  fine_currency: string | null;
  fine_status: ViolationFineStatusEnum;
  fine_paid_at: Date | null;
  notice_sent_at: Date | null;
  created_at: Date;
  resolved_at: Date | null;
  resolved_notes: string | null;
  created_by: number | null;
  property_title: string;
  tenant_name: string;
  tenant_email: string;
  unit_number: string | null;
}

export interface ViolationEventRow {
  id: number;
  event_type: ViolationEventTypeEnum;
  note: string | null;
  metadata: Record<string, unknown>;
  created_by: number | null;
  created_by_name: string | null;
  created_at: Date;
}

export interface ViolationStats {
  total: number;
  open: number;
  overdue: number;
  escalated: number;
  fines_outstanding: number;
}

// Columnas + joins reutilizados por las consultas de lectura.
const VIOLATION_SELECT = `
  v.*,
  p.title         AS property_title,
  u.name          AS tenant_name,
  u.email         AS tenant_email,
  un.unit_number  AS unit_number
FROM violations v
JOIN properties p ON p.id = v.property_id
JOIN "user" u     ON u.id = v.tenant_id
LEFT JOIN units un ON un.id = v.unit_id`;

@Injectable()
export class ViolationsService {
  private readonly logger = new Logger(ViolationsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly violationsPdfService: ViolationsPdfService,
    private readonly storageService: StorageService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  async addEvidencePhotos(
    id: number,
    files: Express.Multer.File[],
    slug: string,
    userId?: number,
  ): Promise<string[]> {
    const violation = await this.findOne(id);
    const newUrls: string[] = [];

    for (const file of files) {
      const targetPath = this.storageService.buildStoragePath(
        'violations',
        slug,
        String(id),
        file.filename,
      );
      await this.storageService.persistUploadedFile(
        file,
        targetPath,
        'private',
      );
      newUrls.push(this.storageService.toRoutePath(targetPath));
    }

    const merged = [...(violation.evidence_photos ?? []), ...newUrls];
    await this.dataSource.query(
      `UPDATE violations SET evidence_photos = $1::jsonb WHERE id = $2`,
      [JSON.stringify(merged), id],
    );

    await this.logEvent(
      id,
      ViolationEventTypeEnum.EVIDENCE_ADDED,
      null,
      { count: newUrls.length },
      userId,
    );

    return merged;
  }

  async create(dto: CreateViolationDto, userId: number): Promise<ViolationRow> {
    const severity = dto.severity ?? ViolationSeverityEnum.MEDIUM;
    const hasFine = dto.fine_amount != null;
    const fineCurrency = hasFine ? await this.resolveCurrency() : null;

    const rows = await this.dataSource.query<{ id: number }[]>(
      `INSERT INTO violations
         (property_id, unit_id, tenant_id, type, severity, description,
          due_date, evidence_photos, fine_amount, fine_currency, fine_status,
          status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9, $10, $11, 'open', $12)
       RETURNING id`,
      [
        dto.property_id,
        dto.unit_id ?? null,
        dto.tenant_id,
        dto.type,
        severity,
        dto.description,
        dto.due_date ?? null,
        JSON.stringify(dto.evidence_photos ?? []),
        dto.fine_amount ?? null,
        fineCurrency,
        hasFine
          ? ViolationFineStatusEnum.CHARGED
          : ViolationFineStatusEnum.NONE,
        userId,
      ],
    );

    const id = rows[0].id;
    await this.logEvent(
      id,
      ViolationEventTypeEnum.CREATED,
      dto.description,
      { severity, type: dto.type },
      userId,
    );
    if (hasFine) {
      await this.logEvent(
        id,
        ViolationEventTypeEnum.FINE_CHARGED,
        null,
        { amount: dto.fine_amount, currency: fineCurrency },
        userId,
      );
    }

    this.logger.log(`Violation created: ${id} by user ${userId}`);
    await this.auditLogsService.log({
      userId,
      action: AuditAction.CREATED,
      entityType: 'violation',
      entityId: id,
      newValues: { type: dto.type, severity, description: dto.description },
    });
    return this.findOne(id);
  }

  async findAll(
    filters: ViolationFiltersDto,
  ): Promise<{ data: ViolationRow[]; total: number }> {
    const params: unknown[] = [];
    const conditions: string[] = ['1=1'];

    if (filters.property_id) {
      params.push(filters.property_id);
      conditions.push(`v.property_id = $${params.length}`);
    }
    if (filters.status) {
      params.push(filters.status);
      conditions.push(`v.status = $${params.length}`);
    }
    if (filters.type) {
      params.push(filters.type);
      conditions.push(`v.type = $${params.length}`);
    }
    if (filters.severity) {
      params.push(filters.severity);
      conditions.push(`v.severity = $${params.length}`);
    }
    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      conditions.push(`v.tenant_id = $${params.length}`);
    }
    if (filters.overdue === 'true') {
      conditions.push(
        `v.due_date IS NOT NULL AND v.due_date < CURRENT_DATE
         AND v.status NOT IN ('resolved', 'dismissed')`,
      );
    }

    const where = conditions.join(' AND ');

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(v.id)::int AS count FROM violations v WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.count ?? 0);

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    params.push(limit, offset);

    const data = await this.dataSource.query<ViolationRow[]>(
      `SELECT ${VIOLATION_SELECT}
       WHERE ${where}
       ORDER BY v.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { data, total };
  }

  async findOne(id: number): Promise<ViolationRow> {
    const rows = await this.dataSource.query<ViolationRow[]>(
      `SELECT ${VIOLATION_SELECT} WHERE v.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Violación con ID ${id} no encontrada`);
    }

    return rows[0];
  }

  /** Detalle completo: la violación + su línea de tiempo de actividad. */
  async findDetail(
    id: number,
  ): Promise<ViolationRow & { events: ViolationEventRow[] }> {
    const violation = await this.findOne(id);
    const events = await this.getEvents(id);
    return { ...violation, events };
  }

  async getEvents(violationId: number): Promise<ViolationEventRow[]> {
    return this.dataSource.query<ViolationEventRow[]>(
      `SELECT e.id, e.event_type, e.note, e.metadata, e.created_by,
              u.name AS created_by_name, e.created_at
         FROM violation_events e
         LEFT JOIN "user" u ON u.id = e.created_by
        WHERE e.violation_id = $1
        ORDER BY e.created_at ASC, e.id ASC`,
      [violationId],
    );
  }

  async updateStatus(
    id: number,
    dto: UpdateViolationStatusDto,
    userId: number,
  ): Promise<ViolationRow> {
    const violation = await this.findOne(id);

    if (
      CLOSED_VIOLATION_STATUSES.includes(violation.status) &&
      !CLOSED_VIOLATION_STATUSES.includes(dto.status)
    ) {
      throw new BadRequestException(
        'No se puede reabrir una violación ya cerrada',
      );
    }

    const closes = CLOSED_VIOLATION_STATUSES.includes(dto.status);
    const resolvedAt = closes ? 'NOW()' : 'NULL';

    await this.dataSource.query(
      `UPDATE violations
          SET status         = $1,
              resolved_notes = COALESCE($2, resolved_notes),
              resolved_at    = ${resolvedAt},
              due_date       = COALESCE($3, due_date)
        WHERE id = $4`,
      [dto.status, dto.resolved_notes ?? null, dto.due_date ?? null, id],
    );

    await this.logEvent(
      id,
      ViolationEventTypeEnum.STATUS_CHANGED,
      dto.resolved_notes ?? null,
      { from: violation.status, to: dto.status },
      userId,
    );

    this.logger.log(
      `Violation ${id} status ${violation.status} -> ${dto.status} by user ${userId}`,
    );

    await this.auditLogsService.log({
      userId,
      action: AuditAction.STATUS_CHANGED,
      entityType: 'violation',
      entityId: id,
      oldValues: { status: violation.status },
      newValues: { status: dto.status },
    });

    return this.findOne(id);
  }

  async addNote(
    id: number,
    dto: AddViolationNoteDto,
    userId: number,
  ): Promise<ViolationEventRow[]> {
    await this.findOne(id);
    await this.logEvent(id, ViolationEventTypeEnum.NOTE, dto.note, {}, userId);
    return this.getEvents(id);
  }

  /** Aplica/actualiza una multa. La violación pasa a 'charged'. */
  async chargeFine(
    id: number,
    dto: ChargeFineDto,
    userId: number,
  ): Promise<ViolationRow> {
    const violation = await this.findOne(id);
    if (violation.fine_status === ViolationFineStatusEnum.PAID) {
      throw new BadRequestException('La multa ya fue pagada');
    }

    const currency = dto.currency ?? (await this.resolveCurrency());

    await this.dataSource.query(
      `UPDATE violations
          SET fine_amount   = $1,
              fine_currency = $2,
              fine_status   = 'charged',
              fine_paid_at  = NULL,
              due_date      = COALESCE($3, due_date)
        WHERE id = $4`,
      [dto.amount, currency, dto.due_date ?? null, id],
    );

    await this.logEvent(
      id,
      ViolationEventTypeEnum.FINE_CHARGED,
      null,
      { amount: dto.amount, currency },
      userId,
    );

    await this.notificationsService.createForUser(
      violation.tenant_id,
      NotificationEventType.VIOLATION_NOTIFIED,
      'Multa por infracción',
      `Se ha aplicado una multa de ${dto.amount} ${currency} por una infracción en "${violation.property_title}".`,
      { violation_id: id, property_id: violation.property_id },
    );

    return this.findOne(id);
  }

  /** Condona la multa (no se cobra). */
  async waiveFine(id: number, userId: number): Promise<ViolationRow> {
    const violation = await this.findOne(id);
    this.assertHasPendingFine(violation);

    await this.dataSource.query(
      `UPDATE violations SET fine_status = 'waived', fine_paid_at = NULL WHERE id = $1`,
      [id],
    );
    await this.logEvent(
      id,
      ViolationEventTypeEnum.FINE_WAIVED,
      null,
      {},
      userId,
    );
    return this.findOne(id);
  }

  /** Marca la multa como pagada. */
  async payFine(id: number, userId: number): Promise<ViolationRow> {
    const violation = await this.findOne(id);
    this.assertHasPendingFine(violation);

    await this.dataSource.query(
      `UPDATE violations SET fine_status = 'paid', fine_paid_at = NOW() WHERE id = $1`,
      [id],
    );
    await this.logEvent(
      id,
      ViolationEventTypeEnum.FINE_PAID,
      null,
      { amount: violation.fine_amount, currency: violation.fine_currency },
      userId,
    );
    return this.findOne(id);
  }

  async notifyTenant(id: number, userId?: number): Promise<void> {
    const violation = await this.findOne(id);

    await this.notificationsService.createForUser(
      violation.tenant_id,
      NotificationEventType.VIOLATION_NOTIFIED,
      'Notificación formal de infracción',
      `Se ha registrado una infracción en la propiedad "${violation.property_title}". ` +
        `Tipo: ${violation.type}. Por favor revise los detalles y tome las medidas necesarias.`,
      { violation_id: id, property_id: violation.property_id },
    );

    const nextStatus =
      violation.status === ViolationStatusEnum.OPEN
        ? ViolationStatusEnum.NOTIFIED
        : violation.status;

    await this.dataSource.query(
      `UPDATE violations SET status = $1, notice_sent_at = NOW() WHERE id = $2`,
      [nextStatus, id],
    );

    await this.logEvent(
      id,
      ViolationEventTypeEnum.NOTIFIED,
      null,
      { channel: 'internal' },
      userId,
    );

    this.logger.log(
      `Tenant ${violation.tenant_id} notified for violation ${id}`,
    );
  }

  async getStats(): Promise<ViolationStats> {
    const rows = await this.dataSource.query<
      {
        total: string;
        open: string;
        overdue: string;
        escalated: string;
        fines_outstanding: string;
      }[]
    >(
      `SELECT
         COUNT(*)::int AS total,
         COUNT(*) FILTER (
           WHERE status NOT IN ('resolved', 'dismissed')
         )::int AS open,
         COUNT(*) FILTER (
           WHERE due_date IS NOT NULL AND due_date < CURRENT_DATE
             AND status NOT IN ('resolved', 'dismissed')
         )::int AS overdue,
         COUNT(*) FILTER (WHERE status = 'escalated')::int AS escalated,
         COALESCE(SUM(fine_amount) FILTER (WHERE fine_status = 'charged'), 0)::text
           AS fines_outstanding
       FROM violations`,
    );

    const row = rows[0];
    return {
      total: Number(row?.total ?? 0),
      open: Number(row?.open ?? 0),
      overdue: Number(row?.overdue ?? 0),
      escalated: Number(row?.escalated ?? 0),
      fines_outstanding: Number(row?.fines_outstanding ?? 0),
    };
  }

  async generatePdf(id: number): Promise<string> {
    const violation = await this.findOne(id);

    const pdfData: ViolationPdfData = {
      id: violation.id,
      property_title: violation.property_title,
      property_address: violation.unit_number
        ? `${violation.property_title} — Unidad ${violation.unit_number}`
        : violation.property_title,
      tenant_name: violation.tenant_name,
      tenant_email: violation.tenant_email,
      type: violation.type,
      description: violation.description,
      status: violation.status,
      evidence_photos: violation.evidence_photos ?? [],
      created_at: violation.created_at,
      resolved_notes: violation.resolved_notes,
    };

    return this.violationsPdfService.generateNotificationLetter(pdfData);
  }

  async getViolationCount(tenantId: number): Promise<number> {
    const rows = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(id)::int AS count FROM violations WHERE tenant_id = $1`,
      [tenantId],
    );
    return Number(rows[0]?.count ?? 0);
  }

  async getViolationHistory(tenantId: number): Promise<ViolationRow[]> {
    return this.dataSource.query<ViolationRow[]>(
      `SELECT ${VIOLATION_SELECT}
       WHERE v.tenant_id = $1
       ORDER BY v.created_at DESC`,
      [tenantId],
    );
  }

  private assertHasPendingFine(violation: ViolationRow): void {
    if (violation.fine_status !== ViolationFineStatusEnum.CHARGED) {
      throw new BadRequestException(
        'La violación no tiene una multa pendiente',
      );
    }
  }

  /** Moneda configurada del tenant; cae a USD si no hay config. */
  private async resolveCurrency(): Promise<string> {
    const rows = await this.dataSource.query<{ currency: string }[]>(
      `SELECT currency FROM tenant_config LIMIT 1`,
    );
    return rows[0]?.currency ?? 'USD';
  }

  private async logEvent(
    violationId: number,
    eventType: ViolationEventTypeEnum,
    note: string | null,
    metadata: Record<string, unknown> = {},
    userId?: number,
  ): Promise<void> {
    await this.dataSource.query(
      `INSERT INTO violation_events
         (violation_id, event_type, note, metadata, created_by)
       VALUES ($1, $2, $3, $4::jsonb, $5)`,
      [
        violationId,
        eventType,
        note,
        JSON.stringify(metadata ?? {}),
        userId ?? null,
      ],
    );
  }
}
