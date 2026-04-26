import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';

interface PdfDoc extends NodeJS.ReadableStream {
  fontSize(size: number): PdfDoc;
  font(font: string): PdfDoc;
  fillColor(color: string): PdfDoc;
  text(text: string, options?: Record<string, unknown>): PdfDoc;
  text(text: string, x: number, y: number, options?: Record<string, unknown>): PdfDoc;
  moveDown(lines?: number): PdfDoc;
  moveTo(x: number, y: number): PdfDoc;
  lineTo(x: number, y: number): PdfDoc;
  stroke(): PdfDoc;
  end(): void;
  y: number;
  page: { width: number; margins: { left: number; right: number } };
}

// eslint-disable-next-line @typescript-eslint/no-require-imports
const PDFDocument = require('pdfkit') as new (options?: Record<string, unknown>) => PdfDoc;

export interface ViolationPdfData {
  id: number;
  property_title: string;
  property_address: string;
  tenant_name: string;
  tenant_email: string;
  type: string;
  description: string;
  status: string;
  evidence_photos: string[];
  created_at: Date | string;
  resolved_notes: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  noise: 'Ruido excesivo',
  pets: 'Mascotas no autorizadas',
  parking: 'Estacionamiento indebido',
  damage: 'Daños a la propiedad',
  cleanliness: 'Falta de limpieza',
  other: 'Otra infracción',
};

@Injectable()
export class ViolationsPdfService {
  private readonly logger = new Logger(ViolationsPdfService.name);
  private readonly outputDir = path.join(process.cwd(), 'uploads', 'violations');

  constructor() {
    if (!fs.existsSync(this.outputDir)) {
      fs.mkdirSync(this.outputDir, { recursive: true });
    }
  }

  async generateNotificationLetter(data: ViolationPdfData): Promise<string> {
    const fileName = `violation_${data.id}_${Date.now()}.pdf`;
    const filePath = path.join(this.outputDir, fileName);

    return new Promise((resolve, reject) => {
      const doc = new PDFDocument({ margin: 60, size: 'A4' });
      const stream = fs.createWriteStream(filePath);

      doc.pipe(stream);

      this.renderHeader(doc, data);
      this.renderBody(doc, data);
      this.renderFooter(doc);

      doc.end();

      stream.on('finish', () => {
        this.logger.log(`PDF generado: ${filePath}`);
        resolve(filePath);
      });
      stream.on('error', reject);
    });
  }

  private renderHeader(doc: PdfDoc, data: ViolationPdfData): void {
    const dateStr = new Date(data.created_at).toLocaleDateString('es-BO', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    });

    doc
      .font('Helvetica-Bold')
      .fontSize(16)
      .text('NOTIFICACIÓN FORMAL DE INFRACCIÓN', { align: 'center' })
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(10)
      .text(`Fecha: ${dateStr}`, { align: 'right' })
      .text(`Referencia: VIO-${String(data.id).padStart(6, '0')}`, { align: 'right' })
      .moveDown(1);

    const lineY = doc.y;
    doc
      .moveTo(60, lineY)
      .lineTo(doc.page.width - 60, lineY)
      .stroke()
      .moveDown(1);
  }

  private renderBody(doc: PdfDoc, data: ViolationPdfData): void {
    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('DESTINATARIO')
      .font('Helvetica')
      .fontSize(10)
      .text(`Inquilino: ${data.tenant_name}`)
      .text(`Email: ${data.tenant_email}`)
      .text(`Propiedad: ${data.property_title}`)
      .text(`Dirección: ${data.property_address}`)
      .moveDown(1);

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('DETALLE DE LA INFRACCIÓN')
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(10)
      .text(`Tipo: ${TYPE_LABELS[data.type] ?? data.type}`)
      .moveDown(0.5)
      .text('Descripción:', { continued: false })
      .text(data.description, { indent: 20 })
      .moveDown(1);

    if (data.evidence_photos.length > 0) {
      doc
        .font('Helvetica-Bold')
        .fontSize(10)
        .text(`Evidencias adjuntas: ${data.evidence_photos.length} archivo(s)`)
        .moveDown(1);
    }

    doc
      .font('Helvetica-Bold')
      .fontSize(11)
      .text('AVISO LEGAL')
      .moveDown(0.5)
      .font('Helvetica')
      .fontSize(10)
      .text(
        'Esta notificación formal le informa que se ha registrado una infracción al reglamento ' +
        'de convivencia o al contrato de arrendamiento. Le solicitamos que corrija esta situación ' +
        'en un plazo máximo de 72 horas desde la recepción de este documento. ' +
        'El incumplimiento reiterado podrá derivar en acciones legales y/o la terminación del contrato.',
        { align: 'justify' },
      )
      .moveDown(1.5);

    if (data.resolved_notes) {
      doc
        .font('Helvetica-Bold')
        .fontSize(11)
        .text('NOTAS DE RESOLUCIÓN')
        .font('Helvetica')
        .fontSize(10)
        .text(data.resolved_notes)
        .moveDown(1);
    }
  }

  private renderFooter(doc: PdfDoc): void {
    const lineY = doc.y + 20;
    doc
      .moveTo(60, lineY)
      .lineTo(doc.page.width - 60, lineY)
      .stroke()
      .moveDown(2);

    const sigY = doc.y;
    doc
      .font('Helvetica')
      .fontSize(10)
      .text('_________________________', 60, sigY)
      .text('Firma del Administrador', 60, sigY + 15)
      .text('_________________________', 350, sigY)
      .text('Firma del Inquilino', 350, sigY + 15)
      .moveDown(3)
      .fontSize(8)
      .fillColor('#888888')
      .text(
        'Documento generado automáticamente por el sistema de gestión de propiedades.',
        { align: 'center' },
      );
  }
}
