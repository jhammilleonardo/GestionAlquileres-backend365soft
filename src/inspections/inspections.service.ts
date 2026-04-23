import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { quoteIdent } from '../common/utils/sql-identifier';
import type { CreateInspectionDto } from './dto/create-inspection.dto';
import type { UpdateInspectionItemsDto } from './dto/update-inspection-items.dto';
import type { FilterInspectionsDto } from './dto/filter-inspections.dto';

interface PdfDoc extends NodeJS.ReadableStream {
  fontSize(size: number): PdfDoc;
  font(font: string): PdfDoc;
  text(text: string, options?: Record<string, unknown>): PdfDoc;
  moveDown(lines?: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  stroke(): PdfDoc;
  addPage(): PdfDoc;
  end(): void;
  y: number;
  page: { width: number; margins: { left: number; right: number } };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as new (
  options?: Record<string, unknown>,
) => PdfDoc;

export interface InspectionRow {
  id: number;
  property_id: number;
  unit_id: number | null;
  contract_id: number | null;
  type: string;
  scheduled_date: string;
  completed_date: string | null;
  inspector_user_id: number | null;
  status: string;
  notes: string | null;
  created_by: number;
  created_at: string;
  updated_at: string;
  property_title: string;
  unit_number: string | null;
  inspector_name: string | null;
  inspector_email: string | null;
  created_by_name: string;
}

export interface InspectionItemRow {
  id: number;
  inspection_id: number;
  area: string;
  item_name: string;
  condition: string;
  notes: string | null;
  photos: string[];
}

@Injectable()
export class InspectionsService {
  constructor(@InjectDataSource() private dataSource: DataSource) {}

  async create(
    schemaName: string,
    dto: CreateInspectionDto,
    userId: number,
  ) {
    const q = quoteIdent(schemaName);

    const [inspection] = await this.dataSource.query<InspectionRow[]>(
      `INSERT INTO ${q}.inspections
         (property_id, unit_id, contract_id, type, scheduled_date,
          inspector_user_id, status, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, 'scheduled', $7, $8)
       RETURNING *`,
      [
        dto.property_id,
        dto.unit_id ?? null,
        dto.contract_id ?? null,
        dto.type,
        dto.scheduled_date,
        dto.inspector_user_id ?? null,
        dto.notes ?? null,
        userId,
      ],
    );

    if (dto.items?.length) {
      for (const item of dto.items) {
        await this.dataSource.query(
          `INSERT INTO ${q}.inspection_items
             (inspection_id, area, item_name, condition, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [
            inspection.id,
            item.area,
            item.item_name,
            item.condition ?? 'good',
            item.notes ?? null,
          ],
        );
      }
    }

    return this.findOne(schemaName, inspection.id);
  }

  async findAll(schemaName: string, filters: FilterInspectionsDto) {
    const q = quoteIdent(schemaName);
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (filters.property_id) {
      conditions.push(`i.property_id = $${idx++}`);
      params.push(filters.property_id);
    }
    if (filters.unit_id) {
      conditions.push(`i.unit_id = $${idx++}`);
      params.push(filters.unit_id);
    }
    if (filters.contract_id) {
      conditions.push(`i.contract_id = $${idx++}`);
      params.push(filters.contract_id);
    }
    if (filters.type) {
      conditions.push(`i.type = $${idx++}`);
      params.push(filters.type);
    }
    if (filters.status) {
      conditions.push(`i.status = $${idx++}`);
      params.push(filters.status);
    }
    if (filters.from) {
      conditions.push(`i.scheduled_date >= $${idx++}`);
      params.push(filters.from);
    }
    if (filters.to) {
      conditions.push(`i.scheduled_date <= $${idx++}`);
      params.push(filters.to);
    }

    const where = conditions.length
      ? `WHERE ${conditions.join(' AND ')}`
      : '';

    return this.dataSource.query(
      `SELECT i.*,
              p.title    AS property_title,
              u.unit_number,
              usr.name   AS inspector_name,
              cb.name    AS created_by_name,
              COUNT(ii.id)::int AS items_count
       FROM ${q}.inspections i
       LEFT JOIN ${q}.properties   p   ON p.id  = i.property_id
       LEFT JOIN ${q}.units         u   ON u.id  = i.unit_id
       LEFT JOIN ${q}."user"        usr ON usr.id = i.inspector_user_id
       LEFT JOIN ${q}."user"        cb  ON cb.id  = i.created_by
       LEFT JOIN ${q}.inspection_items ii ON ii.inspection_id = i.id
       ${where}
       GROUP BY i.id, p.title, u.unit_number, usr.name, cb.name
       ORDER BY i.scheduled_date DESC`,
      params,
    );
  }

  async findOne(schemaName: string, id: number) {
    const q = quoteIdent(schemaName);

    const rows = await this.dataSource.query<InspectionRow[]>(
      `SELECT i.*,
              p.title    AS property_title,
              p.currency,
              u.unit_number,
              u.floor    AS unit_floor,
              usr.name   AS inspector_name,
              usr.email  AS inspector_email,
              cb.name    AS created_by_name
       FROM ${q}.inspections i
       LEFT JOIN ${q}.properties   p   ON p.id  = i.property_id
       LEFT JOIN ${q}.units         u   ON u.id  = i.unit_id
       LEFT JOIN ${q}."user"        usr ON usr.id = i.inspector_user_id
       LEFT JOIN ${q}."user"        cb  ON cb.id  = i.created_by
       WHERE i.id = $1`,
      [id],
    );

    if (!rows.length) {
      throw new NotFoundException(`Inspección ${id} no encontrada`);
    }

    const items = await this.dataSource.query<InspectionItemRow[]>(
      `SELECT * FROM ${q}.inspection_items
       WHERE inspection_id = $1
       ORDER BY area, item_name`,
      [id],
    );

    return { ...rows[0], items };
  }

  async updateItems(
    schemaName: string,
    inspectionId: number,
    dto: UpdateInspectionItemsDto,
    userId: number,
  ) {
    const q = quoteIdent(schemaName);

    const [inspection] = await this.dataSource.query<
      { id: number; status: string }[]
    >(
      `SELECT id, status FROM ${q}.inspections WHERE id = $1`,
      [inspectionId],
    );

    if (!inspection) {
      throw new NotFoundException(`Inspección ${inspectionId} no encontrada`);
    }

    if (inspection.status === 'completed') {
      throw new BadRequestException(
        'No se pueden modificar ítems de una inspección completada',
      );
    }

    for (const item of dto.items) {
      if (item.id) {
        const [exists] = await this.dataSource.query(
          `SELECT id FROM ${q}.inspection_items WHERE id = $1 AND inspection_id = $2`,
          [item.id, inspectionId],
        );
        if (!exists) {
          throw new NotFoundException(
            `Ítem ${item.id} no pertenece a la inspección ${inspectionId}`,
          );
        }
        await this.dataSource.query(
          `UPDATE ${q}.inspection_items
           SET area = $1, item_name = $2, condition = $3, notes = $4, updated_at = now()
           WHERE id = $5`,
          [item.area, item.item_name, item.condition, item.notes ?? null, item.id],
        );
      } else {
        await this.dataSource.query(
          `INSERT INTO ${q}.inspection_items
             (inspection_id, area, item_name, condition, notes)
           VALUES ($1, $2, $3, $4, $5)`,
          [inspectionId, item.area, item.item_name, item.condition, item.notes ?? null],
        );
      }
    }

    // Avanzar estado
    if (dto.complete) {
      await this.dataSource.query(
        `UPDATE ${q}.inspections
         SET status = 'completed', completed_date = CURRENT_DATE, updated_at = now()
         WHERE id = $1`,
        [inspectionId],
      );
    } else if (inspection.status === 'scheduled') {
      await this.dataSource.query(
        `UPDATE ${q}.inspections
         SET status = 'in_progress', updated_at = now()
         WHERE id = $1`,
        [inspectionId],
      );
    }

    void userId; // disponible para auditoría futura
    return this.findOne(schemaName, inspectionId);
  }

  async addPhotosToItem(
    schemaName: string,
    inspectionId: number,
    itemId: number,
    files: Express.Multer.File[],
    tenantSlug: string,
  ) {
    const q = quoteIdent(schemaName);

    const [item] = await this.dataSource.query<
      { id: number; photos: string[] }[]
    >(
      `SELECT id, photos FROM ${q}.inspection_items
       WHERE id = $1 AND inspection_id = $2`,
      [itemId, inspectionId],
    );

    if (!item) {
      throw new NotFoundException(
        `Ítem ${itemId} no encontrado en la inspección ${inspectionId}`,
      );
    }

    const newPhotos = files.map(
      (f) =>
        `/storage/inspections/${tenantSlug}/${inspectionId}/${f.filename}`,
    );
    const allPhotos = [...(item.photos ?? []), ...newPhotos];

    await this.dataSource.query(
      `UPDATE ${q}.inspection_items
       SET photos = $1, updated_at = now()
       WHERE id = $2`,
      [JSON.stringify(allPhotos), itemId],
    );

    return { photos: allPhotos };
  }

  async generatePdf(schemaName: string, inspectionId: number): Promise<Buffer> {
    const inspection = await this.findOne(schemaName, inspectionId);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const pageWidth =
        doc.page.width - doc.page.margins.left - doc.page.margins.right;

      // ── Header ──────────────────────────────────────────────────────────
      doc
        .fontSize(22)
        .font('Helvetica-Bold')
        .text('REPORTE DE INSPECCIÓN', { align: 'center' });

      doc
        .fontSize(10)
        .font('Helvetica')
        .text(`Generado el ${new Date().toLocaleDateString('es-BO')}`, {
          align: 'center',
        });

      doc.moveDown();
      doc
        .moveTo(50, doc.y)
        .lineTo(50 + pageWidth, doc.y)
        .stroke();
      doc.moveDown(0.5);

      // ── Inspection details ───────────────────────────────────────────────
      const typeLabel: Record<string, string> = {
        move_in: 'Entrada',
        move_out: 'Salida',
        periodic: 'Periódica',
      };
      const statusLabel: Record<string, string> = {
        scheduled: 'Programada',
        in_progress: 'En progreso',
        completed: 'Completada',
      };

      doc.fontSize(12).font('Helvetica-Bold').text('Detalles de la Inspección');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`ID:             #${inspection.id}`);
      doc.text(`Tipo:           ${typeLabel[inspection.type] ?? inspection.type}`);
      doc.text(`Estado:         ${statusLabel[inspection.status] ?? inspection.status}`);
      doc.text(`Fecha programada: ${inspection.scheduled_date}`);
      if (inspection.completed_date) {
        doc.text(`Fecha completada: ${inspection.completed_date}`);
      }
      doc.moveDown();

      // ── Property & unit ──────────────────────────────────────────────────
      doc.fontSize(12).font('Helvetica-Bold').text('Propiedad');
      doc.moveDown(0.3);
      doc.fontSize(10).font('Helvetica');
      doc.text(`Propiedad: ${inspection.property_title}`);
      if (inspection.unit_number) {
        doc.text(`Unidad:    ${inspection.unit_number}`);
      }
      doc.moveDown();

      // ── Inspector ────────────────────────────────────────────────────────
      if (inspection.inspector_name) {
        doc.fontSize(12).font('Helvetica-Bold').text('Inspector');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica');
        doc.text(`Nombre: ${inspection.inspector_name}`);
        if (inspection.inspector_email) {
          doc.text(`Email:  ${inspection.inspector_email}`);
        }
        doc.moveDown();
      }

      // ── Checklist items grouped by area ──────────────────────────────────
      doc.fontSize(12).font('Helvetica-Bold').text('Checklist');
      doc
        .moveTo(50, doc.y + 4)
        .lineTo(50 + pageWidth, doc.y + 4)
        .stroke();
      doc.moveDown(0.8);

      const conditionLabel: Record<string, string> = {
        good: 'Bueno',
        fair: 'Regular',
        poor: 'Malo',
        damaged: 'Dañado',
      };
      const areaLabel: Record<string, string> = {
        living_room: 'Sala',
        kitchen: 'Cocina',
        bathroom: 'Baño',
        bedroom: 'Habitación',
        exterior: 'Exterior',
        other: 'Otro',
      };

      const byArea = (inspection.items as InspectionItemRow[]).reduce<
        Record<string, InspectionItemRow[]>
      >((acc, item) => {
        if (!acc[item.area]) acc[item.area] = [];
        acc[item.area].push(item);
        return acc;
      }, {});

      for (const [area, items] of Object.entries(byArea)) {
        doc
          .fontSize(11)
          .font('Helvetica-Bold')
          .text(areaLabel[area] ?? area);
        doc.moveDown(0.2);

        for (const item of items) {
          const condition = conditionLabel[item.condition] ?? item.condition;
          const photosCount = (item.photos ?? []).length;
          const photoInfo = photosCount > 0 ? ` [${photosCount} foto(s)]` : '';
          doc
            .fontSize(9)
            .font('Helvetica')
            .text(
              `  • ${item.item_name} — ${condition}${photoInfo}`,
            );
          if (item.notes) {
            doc
              .fontSize(8)
              .font('Helvetica-Oblique')
              .text(`    ${item.notes}`, { indent: 10 });
          }
        }
        doc.moveDown(0.5);
      }

      // ── General notes ────────────────────────────────────────────────────
      if (inspection.notes) {
        doc.fontSize(12).font('Helvetica-Bold').text('Notas Generales');
        doc.moveDown(0.3);
        doc.fontSize(10).font('Helvetica').text(inspection.notes);
        doc.moveDown();
      }

      // ── Footer ───────────────────────────────────────────────────────────
      doc
        .fontSize(8)
        .font('Helvetica')
        .text('365Soft — Plataforma de Gestión de Propiedades', {
          align: 'center',
        });

      doc.end();
    });
  }

  async compare(schemaName: string, moveInId: number, moveOutId: number) {
    const [moveIn, moveOut] = await Promise.all([
      this.findOne(schemaName, moveInId),
      this.findOne(schemaName, moveOutId),
    ]);

    if (moveIn.type !== 'move_in') {
      throw new BadRequestException(
        `La inspección ${moveInId} no es de tipo move_in`,
      );
    }
    if (moveOut.type !== 'move_out') {
      throw new BadRequestException(
        `La inspección ${moveOutId} no es de tipo move_out`,
      );
    }

    const moveInItems = moveIn.items as InspectionItemRow[];
    const moveOutItems = moveOut.items as InspectionItemRow[];

    // Empareja por area + item_name (case-insensitive)
    const comparison = moveInItems.map((inItem) => {
      const outItem = moveOutItems.find(
        (o) =>
          o.area === inItem.area &&
          o.item_name.toLowerCase() === inItem.item_name.toLowerCase(),
      );
      return {
        area: inItem.area,
        item_name: inItem.item_name,
        move_in_condition: inItem.condition,
        move_out_condition: outItem?.condition ?? null,
        degraded: outItem
          ? this.conditionOrder(outItem.condition) >
            this.conditionOrder(inItem.condition)
          : false,
        move_in_notes: inItem.notes,
        move_out_notes: outItem?.notes ?? null,
        move_in_photos: inItem.photos ?? [],
        move_out_photos: outItem?.photos ?? [],
      };
    });

    const degradedCount = comparison.filter((c) => c.degraded).length;

    return {
      move_in: moveIn,
      move_out: moveOut,
      comparison,
      summary: {
        total_items: comparison.length,
        degraded_items: degradedCount,
        unchanged_items: comparison.filter((c) => !c.degraded).length,
      },
    };
  }

  private conditionOrder(condition: string): number {
    const order: Record<string, number> = {
      good: 0,
      fair: 1,
      poor: 2,
      damaged: 3,
    };
    return order[condition] ?? 0;
  }
}
