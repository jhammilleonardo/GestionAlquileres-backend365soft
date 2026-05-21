import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { NotificationsService } from '../notifications/notifications.service';
import { NotificationEventType } from '../notifications/dto/create-notification.dto';
import {
  ViolationsPdfService,
  ViolationPdfData,
} from './violations-pdf.service';
import { ViolationStatusEnum } from './enums/violation-status.enum';
import {
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
  description: string;
  status: ViolationStatusEnum;
  evidence_photos: string[];
  created_at: Date;
  resolved_at: Date | null;
  resolved_notes: string | null;
  created_by: number | null;
  property_title: string;
  tenant_name: string;
  tenant_email: string;
  unit_number: string | null;
}

@Injectable()
export class ViolationsService {
  private readonly logger = new Logger(ViolationsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
    private readonly notificationsService: NotificationsService,
    private readonly violationsPdfService: ViolationsPdfService,
  ) {}

  async create(dto: CreateViolationDto, userId: number): Promise<ViolationRow> {
    const rows = await this.dataSource.query<ViolationRow[]>(
      `INSERT INTO violations
         (property_id, unit_id, tenant_id, type, description, evidence_photos, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6::jsonb, 'open', $7)
       RETURNING *`,
      [
        dto.property_id,
        dto.unit_id ?? null,
        dto.tenant_id,
        dto.type,
        dto.description,
        JSON.stringify(dto.evidence_photos ?? []),
        userId,
      ],
    );

    this.logger.log(`Violation created: ${rows[0].id} by user ${userId}`);
    return this.findOne(rows[0].id);
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
    if (filters.tenant_id) {
      params.push(filters.tenant_id);
      conditions.push(`v.tenant_id = $${params.length}`);
    }

    const where = conditions.join(' AND ');

    const countResult = await this.dataSource.query<{ count: string }[]>(
      `SELECT COUNT(v.id)::int AS count
       FROM violations v
       WHERE ${where}`,
      params,
    );
    const total = Number(countResult[0]?.count ?? 0);

    const page = Math.max(1, filters.page ?? 1);
    const limit = Math.min(100, Math.max(1, filters.limit ?? 20));
    const offset = (page - 1) * limit;

    params.push(limit, offset);

    const data = await this.dataSource.query<ViolationRow[]>(
      `SELECT
         v.*,
         p.title                AS property_title,
         u.name                 AS tenant_name,
         u.email                AS tenant_email,
         un.unit_number         AS unit_number
       FROM violations v
       JOIN properties p  ON p.id = v.property_id
       JOIN "user" u       ON u.id = v.tenant_id
       LEFT JOIN units un  ON un.id = v.unit_id
       WHERE ${where}
       ORDER BY v.created_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return { data, total };
  }

  async findOne(id: number): Promise<ViolationRow> {
    const rows = await this.dataSource.query<ViolationRow[]>(
      `SELECT
         v.*,
         p.title                AS property_title,
         u.name                 AS tenant_name,
         u.email                AS tenant_email,
         un.unit_number         AS unit_number
       FROM violations v
       JOIN properties p  ON p.id = v.property_id
       JOIN "user" u       ON u.id = v.tenant_id
       LEFT JOIN units un  ON un.id = v.unit_id
       WHERE v.id = $1`,
      [id],
    );

    if (rows.length === 0) {
      throw new NotFoundException(`Violación con ID ${id} no encontrada`);
    }

    return rows[0];
  }

  async updateStatus(
    id: number,
    dto: UpdateViolationStatusDto,
    userId: number,
  ): Promise<ViolationRow> {
    const violation = await this.findOne(id);

    if (
      violation.status === ViolationStatusEnum.RESOLVED &&
      dto.status !== ViolationStatusEnum.RESOLVED
    ) {
      throw new BadRequestException(
        'No se puede reabrir una violación ya resuelta',
      );
    }

    const resolvedAt =
      dto.status === ViolationStatusEnum.RESOLVED ? 'NOW()' : 'NULL';

    await this.dataSource.query(
      `UPDATE violations
       SET status         = $1,
           resolved_notes = $2,
           resolved_at    = ${resolvedAt}
       WHERE id = $3`,
      [dto.status, dto.resolved_notes ?? null, id],
    );

    this.logger.log(
      `Violation ${id} status changed to ${dto.status} by user ${userId}`,
    );

    return this.findOne(id);
  }

  async notifyTenant(id: number): Promise<void> {
    const violation = await this.findOne(id);

    await this.notificationsService.createForUser(
      violation.tenant_id,
      NotificationEventType.VIOLATION_NOTIFIED,
      'Notificación formal de infracción',
      `Se ha registrado una infracción en la propiedad "${violation.property_title}". ` +
        `Tipo: ${violation.type}. Por favor revise los detalles y tome las medidas necesarias.`,
      { violation_id: id, property_id: violation.property_id },
    );

    if (violation.status === ViolationStatusEnum.OPEN) {
      await this.dataSource.query(
        `UPDATE violations SET status = 'notified' WHERE id = $1`,
        [id],
      );
    }

    this.logger.log(
      `Tenant ${violation.tenant_id} notified for violation ${id}`,
    );
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
      `SELECT
         v.*,
         p.title                AS property_title,
         u.name                 AS tenant_name,
         u.email                AS tenant_email,
         un.unit_number         AS unit_number
       FROM violations v
       JOIN properties p  ON p.id = v.property_id
       JOIN "user" u       ON u.id = v.tenant_id
       LEFT JOIN units un  ON un.id = v.unit_id
       WHERE v.tenant_id = $1
       ORDER BY v.created_at DESC`,
      [tenantId],
    );
  }
}
