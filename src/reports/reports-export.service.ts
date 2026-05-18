import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import {
  ReportCellValue,
  ReportData,
  ReportKpis,
  ReportTable,
} from './reports.types';

@Injectable()
export class ReportsExportService {
  private readonly logger = new Logger(ReportsExportService.name);

  async toExcel(data: ReportData, reportName: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportName);

    if (this.isTable(data)) {
      if (data.length > 0) {
        worksheet.columns = Object.keys(data[0]).map((key) => ({
          header: this.toHeader(key),
          key,
          width: 20,
        }));

        data.forEach((row) => worksheet.addRow(row));
      }
    } else {
      worksheet.columns = [
        { header: 'METRIC', key: 'metric', width: 30 },
        { header: 'VALUE', key: 'value', width: 20 },
      ];

      this.getKpiEntries(data).forEach(([key, value]) => {
        worksheet.addRow({
          metric: this.toMetricLabel(key),
          value,
        });
      });
    }

    worksheet.getRow(1).font = { bold: true };
    return Buffer.from(await workbook.xlsx.writeBuffer());
  }

  async toPdf(data: ReportData, reportName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', (buffer: Buffer) => buffers.push(buffer));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        doc.fontSize(20).text(`Report: ${reportName.replace(/_/g, ' ')}`, {
          align: 'center',
        });
        doc.moveDown();
        doc.fontSize(10).text(`Generated ${new Date().toLocaleDateString()}`, {
          align: 'right',
        });
        doc.moveDown(2);
        doc.fontSize(12);

        if (this.isTable(data)) {
          this.writeTable(doc, data);
        } else {
          this.writeKpis(doc, data);
        }

        doc.end();
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        const stack = error instanceof Error ? error.stack : undefined;
        this.logger.error(`Error generating PDF: ${message}`, stack);
        reject(error instanceof Error ? error : new Error(message));
      }
    });
  }

  private writeTable(doc: PDFKit.PDFDocument, rows: ReportTable): void {
    if (rows.length === 0) {
      doc.text('No data available.');
      return;
    }

    const tableTop = doc.y;
    const keys = Object.keys(rows[0]);
    const colWidth = 500 / Math.max(keys.length, 1);

    doc.font('Helvetica-Bold');
    keys.forEach((key, index) => {
      doc.text(
        this.truncate(this.toHeader(key), 15),
        50 + index * colWidth,
        tableTop,
        {
          width: colWidth,
        },
      );
    });
    doc.moveDown();

    doc.font('Helvetica');
    let y = doc.y;
    rows.forEach((row) => {
      if (y > 700) {
        doc.addPage();
        y = 50;
      }

      keys.forEach((key, index) => {
        doc.text(
          this.truncate(this.toDisplayValue(row[key]), 20),
          50 + index * colWidth,
          y,
          {
            width: colWidth,
          },
        );
      });
      y += 20;
    });
  }

  private writeKpis(doc: PDFKit.PDFDocument, data: ReportKpis): void {
    doc.font('Helvetica-Bold');
    this.getKpiEntries(data).forEach(([key, value]) => {
      doc.text(`${this.toMetricLabel(key)}: `, { continued: true });
      doc.font('Helvetica').text(this.toDisplayValue(value));
      doc.moveDown();
      doc.font('Helvetica-Bold');
    });
  }

  private isTable(data: ReportData): data is ReportTable {
    return Array.isArray(data);
  }

  private getKpiEntries(data: ReportKpis): Array<[string, ReportCellValue]> {
    return [
      ['occupancyRate', data.occupancyRate],
      ['totalUnits', data.totalUnits],
      ['occupiedUnits', data.occupiedUnits],
      ['monthlyIncome', data.monthlyIncome],
      ['pendingPaymentsCount', data.pendingPaymentsCount],
      ['activeMaintenanceCount', data.activeMaintenanceCount],
    ];
  }

  private toHeader(key: string): string {
    return key.replace(/_/g, ' ').toUpperCase();
  }

  private toMetricLabel(key: string): string {
    return key
      .replace(/([A-Z])/g, ' $1')
      .replace(/_/g, ' ')
      .toUpperCase();
  }

  private toDisplayValue(value: ReportCellValue): string {
    if (value === null) {
      return '';
    }

    if (value instanceof Date) {
      return value.toISOString().slice(0, 10);
    }

    return String(value);
  }

  private truncate(value: string, maxLength: number): string {
    return value.length > maxLength ? value.slice(0, maxLength) : value;
  }
}
