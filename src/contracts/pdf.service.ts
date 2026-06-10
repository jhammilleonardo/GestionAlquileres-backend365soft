import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

export interface ContractData {
  contract_number: string;
  tenant_id: number;
  tenant_name?: string | null;
  tenant_email?: string | null;
  tenant_phone?: string | null;
  property_title?: string | null;
  property?: {
    title?: string | null;
    addresses?: {
      street_address?: string | null;
      city?: string | null;
      state?: string | null;
      country?: string | null;
    }[];
  };
  street_address?: string | null;
  city?: string | null;
  state?: string | null;
  country?: string | null;
  start_date: string | Date;
  end_date: string | Date;
  duration_months?: number | null;
  monthly_rent: number;
  currency: string;
  payment_day: number;
  deposit_amount: number;
  included_services?: string[] | string | null;
  prohibitions?: string | null;
  jurisdiction?: string | null;
}

/** Evidencia de firma electrónica a estampar en el PDF generado. */
export interface SignatureStamp {
  signatureImage?: string; // data URL PNG/JPEG
  tenantName?: string;
  signedDate?: string | Date;
  signedIp?: string;
}

@Injectable()
export class PdfService {
  async generateContractPdf(
    contract: ContractData,
    tenantInfo: { name?: string; address?: string },
    signature?: SignatureStamp,
  ): Promise<string> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const fileName = `contract_${contract.contract_number}.pdf`;
    const filePath = path.join(process.cwd(), 'storage', 'contracts', fileName);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const propertyTitle =
      contract.property_title ?? contract.property?.title ?? 'Propiedad';
    const propertyAddress =
      contract.street_address ??
      contract.property?.addresses?.[0]?.street_address ??
      'Dirección no especificada';
    const propertyCity =
      contract.city ?? contract.property?.addresses?.[0]?.city ?? '';
    const propertyState =
      contract.state ?? contract.property?.addresses?.[0]?.state ?? '';
    const propertyCountry =
      contract.country ?? contract.property?.addresses?.[0]?.country ?? '';

    // --- HEADER ---
    doc.fontSize(20).text('CONTRATO DE ARRENDAMIENTO', { align: 'center' });
    doc.moveDown();
    doc
      .fontSize(10)
      .text(`Contrato N°: ${contract.contract_number}`, { align: 'right' });
    doc.text(`Fecha de emisión: ${new Date().toLocaleDateString()}`, {
      align: 'right',
    });
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // --- PARTES ---
    doc.fontSize(12).text('PARTES DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);

    doc.fontSize(10).text('EL ARRENDADOR:', { oblique: true });
    doc.text(`Nombre: ${tenantInfo.name ?? 'Empresa Administradora'}`);
    doc.text(`Dirección: ${tenantInfo.address ?? 'N/A'}`);
    doc.moveDown(0.5);

    doc.text('EL ARRENDATARIO (INQUILINO):', { oblique: true });
    doc.text(`Nombre: ${contract.tenant_name ?? 'N/A'}`);
    doc.text(`ID Inquilino: ${contract.tenant_id}`);
    doc.text(`Email: ${contract.tenant_email ?? 'N/A'}`);
    doc.text(`Teléfono: ${contract.tenant_phone ?? 'N/A'}`);
    doc.moveDown(0.5);

    doc.text('LA PROPIEDAD:', { oblique: true });
    doc.text(`Nombre: ${propertyTitle}`);
    const fullAddress = [
      propertyAddress,
      propertyCity,
      propertyState,
      propertyCountry,
    ]
      .filter(Boolean)
      .join(', ');
    doc.text(`Dirección: ${fullAddress || 'No especificada'}`);
    doc.moveDown();

    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // --- CLAUSULAS ---
    doc.fontSize(12).text('CLAUSULAS DEL CONTRATO', { underline: true });
    doc.moveDown(0.5);

    this.addClause(
      doc,
      'PRIMERA. OBJETO DEL CONTRATO',
      'El Arrendador cede en arrendamiento al Arrendatario la propiedad descrita anteriormente para uso exclusivamente residencial.',
    );

    const startDate = new Date(contract.start_date);
    const endDate = new Date(contract.end_date);
    const durationMonths = contract.duration_months ?? 12;

    this.addClause(
      doc,
      'SEGUNDA. DURACIÓN',
      `El presente contrato tendrá una duración de ${durationMonths} meses, iniciando el ${startDate.toLocaleDateString()} y finalizando el ${endDate.toLocaleDateString()}.`,
    );

    const monthlyRent = contract.monthly_rent;
    const currency = contract.currency;
    const paymentDay = contract.payment_day;

    this.addClause(
      doc,
      'TERCERA. RENTA MENSUAL',
      `El monto del alquiler mensual es de ${monthlyRent} ${currency}, pagaderos los días ${paymentDay} de cada mes.`,
    );

    this.addClause(
      doc,
      'CUARTA. DEPÓSITO DE GARANTÍA',
      `El Arrendatario entrega en este acto la suma de ${contract.deposit_amount} ${currency} en concepto de depósito de garantía.`,
    );

    const includedServices = this.parseIncludedServices(
      contract.included_services,
    );
    if (includedServices.length > 0) {
      this.addClause(
        doc,
        'QUINTA. SERVICIOS INCLUIDOS',
        `Los servicios incluidos son: ${includedServices.join(', ')}.`,
      );
    }

    doc.addPage();

    this.addClause(
      doc,
      'SEXTA. OBLIGACIONES Y PROHIBICIONES',
      contract.prohibitions ??
        'El Arrendatario se compromete a mantener la propiedad en buen estado.',
    );

    const jurisdiction = contract.jurisdiction ?? 'Bolivia';
    this.addClause(
      doc,
      'SEPTIMA. JURISDICCIÓN',
      `Para cualquier conflicto legal, las partes se someten a la jurisdicción de ${jurisdiction}.`,
    );

    doc.moveDown(2);

    doc
      .fontSize(12)
      .text('________________________           ________________________', {
        align: 'center',
      });
    doc
      .fontSize(10)
      .text('Firma del Arrendatario              Firma del Arrendador', {
        align: 'center',
      });

    this.stampSignature(doc, signature);

    doc.moveDown(4);
    doc
      .fillColor('gray')
      .fontSize(8)
      .text(
        `Documento generado automáticamente el ${new Date().toLocaleString()}`,
        { align: 'center' },
      );
    doc.fillColor('black').text('Página 1 de 1', { align: 'right' });

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 1000) {
            resolve(filePath);
          } else {
            reject(
              new Error(`Generated PDF is too small (${stats.size} bytes)`),
            );
          }
        } else {
          reject(new Error('PDF file was not created'));
        }
      });
      stream.on('error', (err) => {
        reject(new Error(`Stream error: ${err.message}`));
      });
    });
  }

  /**
   * Genera un PDF a partir de contenido de plantilla con variables ya sustituidas.
   * Reglas de renderizado:
   *   - Primera línea no vacía → título centrado en negrita
   *   - Líneas en MAYÚSCULAS (>= 4 chars) → encabezado de sección bold
   *   - Líneas vacías → espacio vertical
   *   - Líneas con _____ → bloque de firma centrado
   *   - Resto → texto normal justificado
   */
  async generateContractPdfFromTemplate(
    contractNumber: string,
    content: string,
    signature?: SignatureStamp,
  ): Promise<string> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const fileName = `contract_${contractNumber}.pdf`;
    const filePath = path.join(process.cwd(), 'storage', 'contracts', fileName);

    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    const lines = content.split('\n');
    let isFirstLine = true;

    for (const raw of lines) {
      const line = raw.trimEnd();

      if (isFirstLine && line.trim().length > 0) {
        doc.fontSize(18).font('Helvetica-Bold').text(line, { align: 'center' });
        doc.moveDown(0.5);
        doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
        doc.moveDown();
        isFirstLine = false;
        continue;
      }

      if (line.trim() === '') {
        doc.moveDown(0.5);
        continue;
      }

      if (line.includes('_____')) {
        doc.moveDown();
        doc.fontSize(10).font('Helvetica').text(line, { align: 'center' });
        continue;
      }

      if (
        line.trim().length >= 4 &&
        line.trim() === line.trim().toUpperCase() &&
        /[A-ZÁÉÍÓÚÑ]/u.test(line)
      ) {
        doc.fontSize(11).font('Helvetica-Bold').text(line.trim());
        doc.moveDown(0.3);
        continue;
      }

      doc.fontSize(10).font('Helvetica').text(line, { align: 'justify' });
    }

    this.stampSignature(doc, signature);

    doc.moveDown(3);
    doc
      .fillColor('gray')
      .fontSize(8)
      .text(
        `Documento generado automáticamente el ${new Date().toLocaleString()}`,
        { align: 'center' },
      );
    doc.fillColor('black');

    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 500) {
            resolve(filePath);
          } else {
            reject(
              new Error(`Generated PDF is too small (${stats.size} bytes)`),
            );
          }
        } else {
          reject(new Error('PDF file was not created'));
        }
      });
      stream.on('error', (err) => {
        reject(new Error(`Stream error: ${err.message}`));
      });
    });
  }

  private parseIncludedServices(
    raw: string[] | string | null | undefined,
  ): string[] {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw;
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as string[]) : [];
    } catch {
      return [];
    }
  }

  private addClause(doc: PDFKit.PDFDocument, title: string, content: string) {
    doc.font('Helvetica-Bold').fontSize(11).text(title);
    doc.font('Helvetica').fontSize(10).text(content, { align: 'justify' });
    doc.moveDown();
  }

  /**
   * Estampa la firma electrónica del inquilino en el PDF: imagen de la firma
   * más la evidencia (nombre, fecha, IP) — equivalente al bloque de firma de
   * un documento eSignature.
   */
  private stampSignature(
    doc: PDFKit.PDFDocument,
    signature?: SignatureStamp,
  ): void {
    if (!signature?.signatureImage) {
      return;
    }

    const buffer = this.dataUrlToBuffer(signature.signatureImage);
    if (!buffer) {
      return;
    }

    doc.moveDown(2);

    // Evita que la firma quede partida entre páginas.
    if (doc.y > 650) {
      doc.addPage();
    }

    doc
      .fontSize(11)
      .font('Helvetica-Bold')
      .fillColor('black')
      .text('FIRMA ELECTRÓNICA DEL ARRENDATARIO');
    doc.moveDown(0.5);

    try {
      doc.image(buffer, { width: 180, height: 70 });
    } catch {
      // PNG inválido — no interrumpir la generación del documento.
    }

    doc
      .moveTo(doc.x, doc.y)
      .lineTo(doc.x + 220, doc.y)
      .stroke();
    doc.moveDown(0.3);

    const signedDate = signature.signedDate
      ? new Date(signature.signedDate).toLocaleString()
      : new Date().toLocaleString();

    doc.fontSize(9).font('Helvetica').fillColor('gray');
    if (signature.tenantName) {
      doc.text(`Firmado por: ${signature.tenantName}`);
    }
    doc.text(`Fecha de firma: ${signedDate}`);
    if (signature.signedIp) {
      doc.text(`IP de origen: ${signature.signedIp}`);
    }
    doc.text(
      'Firma electrónica con validez legal (ESIGN / UETA). Esta firma y su ' +
        'registro de auditoría identifican de forma única al firmante.',
    );
    doc.fillColor('black');
  }

  /** Convierte un data URL (data:image/png;base64,...) a Buffer. */
  private dataUrlToBuffer(dataUrl: string): Buffer | null {
    const match = /^data:image\/(?:png|jpeg);base64,(.+)$/.exec(dataUrl);
    if (!match) {
      return null;
    }
    try {
      return Buffer.from(match[1], 'base64');
    } catch {
      return null;
    }
  }
}
