import { Injectable, Logger } from '@nestjs/common';
import PDFDocument from 'pdfkit';
import * as fs from 'fs';
import * as path from 'path';

interface OwnerStatementData {
  id: number;
  owner_name: string;
  property_title: string;
  property_address: string;
  property_city: string;
  property_country: string;
  tenant_name?: string;
  period_year: number;
  period_month: number;
  gross_rent: number;
  maintenance_deduction: number;
  management_commission: number;
  net_amount: number;
  currency: string;
  company_name?: string;
  company_address?: string;
  tenant_id?: string;
}

interface I18nTexts {
  title: string;
  statementNumber: string;
  issueDate: string;
  period: string;
  from: string;
  to: string;
  propertySection: string;
  propertyTitle: string;
  address: string;
  tenant: string;
  tenantEmail: string;
  tenantPhone: string;
  financialSummary: string;
  grossRent: string;
  maintenanceDeduction: string;
  managementCommission: string;
  netAmount: string;
  description: string;
  issuedBy: string;
  digitalSignature: string;
  confidential: string;
  footer: string;
}

@Injectable()
export class OwnerStatementPdfService {
  private readonly logger = new Logger(OwnerStatementPdfService.name);
  private readonly uploadDir = path.join(
    process.cwd(),
    'uploads',
    'owner-statements',
  );

  constructor() {
    this.ensureUploadDir();
  }

  private ensureUploadDir(): void {
    if (!fs.existsSync(this.uploadDir)) {
      fs.mkdirSync(this.uploadDir, { recursive: true });
    }
  }

  private getI18nTexts(language: 'es' | 'en' = 'es'): I18nTexts {
    const texts: Record<'es' | 'en', I18nTexts> = {
      es: {
        title: 'COMPROBANTE DE LIQUIDACIÓN MENSUAL',
        statementNumber: 'Comprobante N°',
        issueDate: 'Fecha de emisión',
        period: 'Período',
        from: 'Del',
        to: 'al',
        propertySection: 'INFORMACIÓN DE LA PROPIEDAD',
        propertyTitle: 'Propiedad',
        address: 'Dirección',
        tenant: 'Inquilino',
        tenantEmail: 'Email del Inquilino',
        tenantPhone: 'Teléfono del Inquilino',
        financialSummary: 'RESUMEN FINANCIERO',
        grossRent: 'Renta Bruta del Período',
        maintenanceDeduction: 'Deducción por Mantenimiento',
        managementCommission: 'Comisión de Gestión',
        netAmount: 'Monto Neto Transferido',
        description: 'Descripción de Retenciones y Deducciones',
        issuedBy: 'Emitido por: Sistema de Gestión 365Soft',
        digitalSignature: 'Firma Digital',
        confidential: 'DOCUMENTO CONFIDENCIAL',
        footer:
          'Este documento es un comprobante oficial de la liquidación realizada. Conserve para sus registros contables.',
      },
      en: {
        title: 'MONTHLY LIQUIDATION RECEIPT',
        statementNumber: 'Receipt N°',
        issueDate: 'Issue Date',
        period: 'Period',
        from: 'From',
        to: 'to',
        propertySection: 'PROPERTY INFORMATION',
        propertyTitle: 'Property',
        address: 'Address',
        tenant: 'Tenant',
        tenantEmail: 'Tenant Email',
        tenantPhone: 'Tenant Phone',
        financialSummary: 'FINANCIAL SUMMARY',
        grossRent: 'Gross Rent for Period',
        maintenanceDeduction: 'Maintenance Deduction',
        managementCommission: 'Management Commission',
        netAmount: 'Net Amount Transferred',
        description: 'Description of Deductions and Withholdings',
        issuedBy: 'Issued by: 365Soft Management System',
        digitalSignature: 'Digital Signature',
        confidential: 'CONFIDENTIAL DOCUMENT',
        footer:
          'This document is an official receipt of the liquidation performed. Keep it for your accounting records.',
      },
    };

    return texts[language];
  }

  async generatePdf(
    statementData: OwnerStatementData,
    language: 'es' | 'en' = 'es',
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({
          margin: 40,
          size: 'A4',
          bufferPages: true,
        });

        const fileName = `liquidacion_${statementData.id}_${statementData.owner_name.replace(/\s+/g, '_')}.pdf`;
        const filePath = path.join(this.uploadDir, fileName);
        const stream = fs.createWriteStream(filePath);

        doc.on('end', () => {
          this.logger.log(`PDF generado exitosamente: ${filePath}`);
          resolve(filePath);
        });

        doc.on('error', (err: Error) => {
          reject(new Error(`Error al generar PDF: ${err.message}`));
        });

        stream.on('error', (err: Error) => {
          reject(new Error(`Error al escribir archivo: ${err.message}`));
        });

        doc.pipe(stream);

        // Render the PDF
        this.renderPdfContent(doc, statementData, language);

        doc.end();
      } catch (error: unknown) {
        reject(toError(error));
      }
    });
  }

  private renderPdfContent(
    doc: InstanceType<typeof PDFDocument>,
    data: OwnerStatementData,
    language: 'es' | 'en',
  ): void {
    const texts = this.getI18nTexts(language);
    const pageWidth = doc.page.width;
    const pageHeight = doc.page.height;

    // --- HEADER SECTION ---
    doc.fontSize(10).fillColor('#666666').text(texts.confidential, {
      align: 'center',
    });
    doc.moveDown(0.3);

    // Title
    doc.fontSize(20).fillColor('#000000').text(texts.title, {
      align: 'center',
      underline: true,
    });
    doc.moveDown(0.5);

    // Horizontal line
    doc
      .moveTo(40, doc.y)
      .lineTo(pageWidth - 40, doc.y)
      .stroke('#333333');
    doc.moveDown(0.5);

    // --- METADATA SECTION ---
    const metadataY = doc.y;
    doc.fontSize(10).fillColor('#333333');

    // Left column
    doc.text(`${texts.statementNumber}: ${data.id}`, 40);
    doc.text(
      `${texts.issueDate}: ${new Date().toLocaleDateString(language === 'es' ? 'es-ES' : 'en-US')}`,
    );

    // Right column
    doc.fontSize(10).fillColor('#333333');
    const periodText = `${texts.period}: ${texts.from} 01/${String(data.period_month).padStart(2, '0')}/${data.period_year} ${texts.to} ${this.getLastDayOfMonth(data.period_month, data.period_year)}/${String(data.period_month).padStart(2, '0')}/${data.period_year}`;
    doc.text(periodText, 40, metadataY + 35);

    doc.moveDown(2);

    // --- PROPERTY SECTION ---
    doc.fontSize(12).fillColor('#1a5490').text(texts.propertySection, {
      underline: true,
    });
    doc.moveDown(0.3);

    doc.fontSize(10).fillColor('#000000');
    doc.text(`${texts.propertyTitle}: ${data.property_title}`);
    doc.text(
      `${texts.address}: ${data.property_address}, ${data.property_city}, ${data.property_country}`,
    );

    if (data.tenant_name) {
      doc.text(`${texts.tenant}: ${data.tenant_name}`);
    }

    doc.moveDown(0.5);

    // --- FINANCIAL SECTION ---
    doc.fontSize(12).fillColor('#1a5490').text(texts.financialSummary, {
      underline: true,
    });
    doc.moveDown(0.3);

    // Financial table
    this.renderFinancialTable(doc, data, texts);

    doc.moveDown(1);

    // --- DEDUCTION DETAILS ---
    if (data.maintenance_deduction > 0) {
      doc.fontSize(10).fillColor('#333333');
      doc.text(texts.description + ':', { underline: true });
      doc.moveDown(0.2);
      doc.fontSize(9).fillColor('#666666');

      if (data.maintenance_deduction > 0) {
        doc.text(
          `• ${texts.maintenanceDeduction}: ${data.currency} ${this.formatCurrency(data.maintenance_deduction)}`,
          { indent: 20 },
        );
      }

      doc.moveDown(0.5);
    }

    // --- FOOTER ---
    doc.moveDown(1);
    doc.fontSize(9).fillColor('#666666');
    doc.text(texts.issuedBy, { align: 'center' });
    doc.text(texts.digitalSignature, { align: 'center' });

    doc.moveDown(0.5);
    doc
      .fontSize(8)
      .fillColor('#999999')
      .text(texts.footer, {
        align: 'center',
        width: pageWidth - 80,
      });

    // --- PAGE FOOTER ---
    doc.fontSize(7).fillColor('#cccccc');
    doc.text(
      `Página 1 of 1 | Generado: ${new Date().toISOString()}`,
      40,
      pageHeight - 30,
      { align: 'center' },
    );
  }

  private renderFinancialTable(
    doc: InstanceType<typeof PDFDocument>,
    data: OwnerStatementData,
    texts: I18nTexts,
  ): void {
    const tableTop = doc.y;
    const rowHeight = 25;
    const colWidth = 280;

    // Table header background
    doc
      .rect(40, tableTop, colWidth, rowHeight)
      .fillAndStroke('#1a5490', '#1a5490');

    // Table header text
    doc.fontSize(11).fillColor('#ffffff').font('Helvetica-Bold');
    doc.text('Concepto', 50, tableTop + 5);
    doc.text('Monto', 220, tableTop + 5);

    // Row 1: Gross Rent
    this.drawTableRow(
      doc,
      tableTop + rowHeight,
      rowHeight,
      texts.grossRent,
      data.gross_rent,
      data.currency,
    );

    // Row 2: Maintenance Deduction
    if (data.maintenance_deduction > 0) {
      this.drawTableRow(
        doc,
        tableTop + rowHeight * 2,
        rowHeight,
        `- ${texts.maintenanceDeduction}`,
        -data.maintenance_deduction,
        data.currency,
        true,
      );
    }

    // Row 3: Management Commission
    this.drawTableRow(
      doc,
      tableTop + rowHeight * (data.maintenance_deduction > 0 ? 3 : 2),
      rowHeight,
      `- ${texts.managementCommission}`,
      -data.management_commission,
      data.currency,
      true,
    );

    // Row 4: Net Amount (highlighted)
    const netRowY =
      tableTop + rowHeight * (data.maintenance_deduction > 0 ? 4 : 3);
    doc
      .rect(40, netRowY, colWidth, rowHeight)
      .fillAndStroke('#e8f0f7', '#1a5490');
    doc.fontSize(11).fillColor('#1a5490').font('Helvetica-Bold');
    doc.text(texts.netAmount, 50, netRowY + 5);
    doc.text(
      `${data.currency} ${this.formatCurrency(data.net_amount)}`,
      220,
      netRowY + 5,
    );

    doc.y = netRowY + rowHeight;
  }

  private drawTableRow(
    doc: InstanceType<typeof PDFDocument>,
    y: number,
    height: number,
    label: string,
    amount: number,
    currency: string,
    isDeduction: boolean = false,
  ): void {
    // Row background
    doc.rect(40, y, 280, height).fill('#ffffff').stroke('#cccccc');

    // Text
    doc.fontSize(10).fillColor('#000000').font('Helvetica');
    doc.text(label, 50, y + 5);

    const amountText = isDeduction
      ? `${currency} -${this.formatCurrency(amount)}`
      : `${currency} ${this.formatCurrency(amount)}`;
    doc.fillColor(isDeduction ? '#d64545' : '#27ae60');
    doc.text(amountText, 220, y + 5);
  }

  private getLastDayOfMonth(month: number, year: number): number {
    return new Date(year, month, 0).getDate();
  }

  private formatCurrency(value: number): string {
    return Math.abs(value)
      .toFixed(2)
      .replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  getPdfPath(statementId: number, ownerName: string): string | null {
    const fileName = `liquidacion_${statementId}_${ownerName.replace(/\s+/g, '_')}.pdf`;
    const filePath = path.join(this.uploadDir, fileName);

    if (fs.existsSync(filePath)) {
      return filePath;
    }

    return null;
  }

  deletePdf(statementId: number, ownerName: string): Promise<void> {
    const filePath = this.getPdfPath(statementId, ownerName);
    if (filePath && fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      this.logger.log(`PDF eliminado: ${filePath}`);
    }

    return Promise.resolve();
  }
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}
