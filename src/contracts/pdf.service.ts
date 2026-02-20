import { Injectable } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

@Injectable()
export class PdfService {
  async generateContractPdf(
    contract: any,
    tenantInfo: { name?: string; address?: string },
  ): Promise<string> {
    const doc = new PDFDocument({ margin: 50, size: 'A4' });
    const fileName = `contract_${contract.contract_number}.pdf`;
    const filePath = path.join(process.cwd(), 'uploads', 'contracts', fileName);

    // Ensure directory exists
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Preparar datos de la propiedad
    const propertyTitle =
      contract.property_title || contract.property?.title || 'Propiedad';
    const propertyAddress =
      contract.street_address ||
      contract.property?.addresses?.[0]?.street_address ||
      'Dirección no especificada';
    const propertyCity =
      contract.city || contract.property?.addresses?.[0]?.city || '';
    const propertyState =
      contract.state || contract.property?.addresses?.[0]?.state || '';
    const propertyCountry =
      contract.country || contract.property?.addresses?.[0]?.country || '';

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
    doc.text(`Nombre: ${tenantInfo.name || 'Empresa Administradora'}`);
    doc.text(`Dirección: ${tenantInfo.address || 'N/A'}`);
    doc.moveDown(0.5);

    doc.text('EL ARRENDATARIO (INQUILINO):', { oblique: true });
    doc.text(`Nombre: ${contract.tenant_name || 'N/A'}`);
    doc.text(`ID Inquilino: ${contract.tenant_id}`);
    doc.text(`Email: ${contract.tenant_email || 'N/A'}`);
    doc.text(`Teléfono: ${contract.tenant_phone || 'N/A'}`);
    doc.moveDown(0.5);

    doc.text(`LA PROPIEDAD:`, { oblique: true });
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

    // Parsear fechas
    const startDate = new Date(contract.start_date);
    const endDate = new Date(contract.end_date);
    const durationMonths = contract.duration_months || 12;

    this.addClause(
      doc,
      'SEGUNDA. DURACIÓN',
      `El presente contrato tendrá una duración de ${durationMonths} meses, iniciando el ${startDate.toLocaleDateString()} y finalizando el ${endDate.toLocaleDateString()}.`,
    );

    const monthlyRent = contract.monthly_rent || 0;
    const currency = contract.currency || 'BOB';
    const paymentDay = contract.payment_day || 5;

    this.addClause(
      doc,
      'TERCERA. RENTA MENSUAL',
      `El monto del alquiler mensual es de ${monthlyRent} ${currency}, pagaderos los días ${paymentDay} de cada mes.`,
    );

    const depositAmount = contract.deposit_amount || 0;

    this.addClause(
      doc,
      'CUARTA. DEPÓSITO DE GARANTÍA',
      `El Arrendatario entrega en este acto la suma de ${depositAmount} ${currency} en concepto de depósito de garantía.`,
    );

    // Parsear servicios incluidos
    let includedServices: string[] = [];
    try {
      if (typeof contract.included_services === 'string') {
        includedServices = JSON.parse(contract.included_services);
      } else if (Array.isArray(contract.included_services)) {
        includedServices = contract.included_services;
      }
    } catch (e) {
      includedServices = [];
    }

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
      contract.prohibitions ||
        'El Arrendatario se compromete a mantener la propiedad en buen estado.',
    );

    const jurisdiction = contract.jurisdiction || 'Bolivia';
    this.addClause(
      doc,
      'SEPTIMA. JURISDICCIÓN',
      `Para cualquier conflicto legal, las partes se someten a la jurisdicción de ${jurisdiction}.`,
    );

    doc.moveDown(2);

    // --- FIRMAS ---
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

    doc.moveDown(4);
    doc
      .fillColor('gray')
      .fontSize(8)
      .text(
        `Documento generado automáticamente el ${new Date().toLocaleString()}`,
        { align: 'center' },
      );
    doc.fillColor('black').text(`Página 1 de 1`, { align: 'right' });

    // End the document and wait for all writes to complete
    doc.end();

    return new Promise((resolve, reject) => {
      stream.on('finish', () => {
        // Verify the file was created and has content
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          if (stats.size > 1000) {
            // PDF should be at least 1KB
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

  private addClause(doc: PDFKit.PDFDocument, title: string, content: string) {
    doc.font('Helvetica-Bold').fontSize(11).text(title);
    doc.font('Helvetica').fontSize(10).text(content, { align: 'justify' });
    doc.moveDown();
  }
}
