import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import type {
  InspectionDetail,
  InspectionItemRow,
} from './inspections.service';

interface PdfDoc extends NodeJS.ReadableStream {
  fontSize(size: number): PdfDoc;
  font(font: string): PdfDoc;
  text(text: string, options?: Record<string, unknown>): PdfDoc;
  moveDown(lines?: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  stroke(): PdfDoc;
  end(): void;
  y: number;
  page: { width: number; margins: { left: number; right: number } };
}

function createPdfDocument(options?: Record<string, unknown>): PdfDoc {
  return new PDFDocument(options) as unknown as PdfDoc;
}

@Injectable()
export class InspectionPdfService {
  generate(inspection: InspectionDetail): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const doc = createPdfDocument({ margin: 50, size: 'A4' });
      const chunks: Buffer[] = [];

      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', (error: Error) => reject(error));

      this.render(doc, inspection);
      doc.end();
    });
  }

  private render(doc: PdfDoc, inspection: InspectionDetail): void {
    const pageWidth =
      doc.page.width - doc.page.margins.left - doc.page.margins.right;

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

    this.renderInspectionDetails(doc, inspection);
    this.renderPropertyDetails(doc, inspection);
    this.renderInspectorDetails(doc, inspection);
    this.renderChecklist(doc, inspection.items, pageWidth);
    this.renderNotes(doc, inspection);
    this.renderFooter(doc);
  }

  private renderInspectionDetails(
    doc: PdfDoc,
    inspection: InspectionDetail,
  ): void {
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
    doc.text(
      `Tipo:           ${typeLabel[inspection.type] ?? inspection.type}`,
    );
    doc.text(
      `Estado:         ${statusLabel[inspection.status] ?? inspection.status}`,
    );
    doc.text(`Fecha programada: ${inspection.scheduled_date}`);
    if (inspection.completed_date) {
      doc.text(`Fecha completada: ${inspection.completed_date}`);
    }
    doc.moveDown();
  }

  private renderPropertyDetails(
    doc: PdfDoc,
    inspection: InspectionDetail,
  ): void {
    doc.fontSize(12).font('Helvetica-Bold').text('Propiedad');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Propiedad: ${inspection.property_title}`);
    if (inspection.unit_number) {
      doc.text(`Unidad:    ${inspection.unit_number}`);
    }
    doc.moveDown();
  }

  private renderInspectorDetails(
    doc: PdfDoc,
    inspection: InspectionDetail,
  ): void {
    if (!inspection.inspector_name) {
      return;
    }

    doc.fontSize(12).font('Helvetica-Bold').text('Inspector');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica');
    doc.text(`Nombre: ${inspection.inspector_name}`);
    if (inspection.inspector_email) {
      doc.text(`Email:  ${inspection.inspector_email}`);
    }
    doc.moveDown();
  }

  private renderChecklist(
    doc: PdfDoc,
    items: InspectionItemRow[],
    pageWidth: number,
  ): void {
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

    const byArea = items.reduce<Record<string, InspectionItemRow[]>>(
      (acc, item) => {
        if (!acc[item.area]) {
          acc[item.area] = [];
        }
        acc[item.area].push(item);
        return acc;
      },
      {},
    );

    for (const [area, areaItems] of Object.entries(byArea)) {
      doc
        .fontSize(11)
        .font('Helvetica-Bold')
        .text(areaLabel[area] ?? area);
      doc.moveDown(0.2);

      for (const item of areaItems) {
        const condition = conditionLabel[item.condition] ?? item.condition;
        const photosCount = (item.photos ?? []).length;
        const photoInfo = photosCount > 0 ? ` [${photosCount} foto(s)]` : '';
        doc
          .fontSize(9)
          .font('Helvetica')
          .text(`  • ${item.item_name} — ${condition}${photoInfo}`);
        if (item.notes) {
          doc
            .fontSize(8)
            .font('Helvetica-Oblique')
            .text(`    ${item.notes}`, { indent: 10 });
        }
      }
      doc.moveDown(0.5);
    }
  }

  private renderNotes(doc: PdfDoc, inspection: InspectionDetail): void {
    if (!inspection.notes) {
      return;
    }

    doc.fontSize(12).font('Helvetica-Bold').text('Notas Generales');
    doc.moveDown(0.3);
    doc.fontSize(10).font('Helvetica').text(inspection.notes);
    doc.moveDown();
  }

  private renderFooter(doc: PdfDoc): void {
    doc
      .fontSize(8)
      .font('Helvetica')
      .text('365Soft — Plataforma de Gestión de Propiedades', {
        align: 'center',
      });
  }
}
