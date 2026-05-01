import { Injectable, Logger } from '@nestjs/common';
import * as ExcelJS from 'exceljs';
const PDFDocument = require('pdfkit');

@Injectable()
export class ReportsExportService {
  private readonly logger = new Logger(ReportsExportService.name);

  async toExcel(data: any[], reportName: string): Promise<Buffer> {
    const workbook = new ExcelJS.Workbook();
    const worksheet = workbook.addWorksheet(reportName);

    if (data.length > 0) {
      if (Array.isArray(data)) {
        const columns = Object.keys(data[0]).map(key => ({
          header: key.replace(/_/g, ' ').toUpperCase(),
          key: key,
          width: 20
        }));
        worksheet.columns = columns;

        data.forEach(row => {
          worksheet.addRow(row);
        });
      } else {
        // object like kpis
        const columns = [
          { header: 'METRIC', key: 'metric', width: 30 },
          { header: 'VALUE', key: 'value', width: 20 }
        ];
        worksheet.columns = columns;
        Object.entries(data).forEach(([key, value]) => {
          worksheet.addRow({ metric: key.replace(/([A-Z])/g, ' $1').toUpperCase(), value });
        });
      }
    }

    worksheet.getRow(1).font = { bold: true };
    return (await workbook.xlsx.writeBuffer()) as unknown as Buffer;
  }

  async toPdf(data: any, reportName: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      try {
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        const buffers: Buffer[] = [];

        doc.on('data', buffers.push.bind(buffers));
        doc.on('end', () => resolve(Buffer.concat(buffers)));

        // Title
        doc.fontSize(20).text(`Report: ${reportName.replace(/_/g, ' ')}`, { align: 'center' });
        doc.moveDown();
        doc.fontSize(10).text(`Generated ${new Date().toLocaleDateString()}`, { align: 'right' });
        doc.moveDown(2);

        doc.fontSize(12);

        if (Array.isArray(data)) {
          if (data.length === 0) {
            doc.text('No data available.');
          } else {
            const tableTop = doc.y;
            const keys = Object.keys(data[0]);
            const colWidth = 500 / keys.length;
            
            // Header
            doc.font('Helvetica-Bold');
            keys.forEach((k, i) => {
              doc.text(k.replace(/_/g, ' ').substring(0, 15), 50 + (i * colWidth), tableTop, { width: colWidth });
            });
            doc.moveDown();
            
            // Rows
            doc.font('Helvetica');
            let y = doc.y;
            data.forEach((row, rowIndex) => {
              if (y > 700) {
                doc.addPage();
                y = 50;
              }
              keys.forEach((k, i) => {
                const val = row[k] !== null && row[k] !== undefined ? String(row[k]) : '';
                doc.text(val.substring(0, 20), 50 + (i * colWidth), y, { width: colWidth });
              });
              y += 20;
            });
          }
        } else {
          // Object (KPIs)
          doc.font('Helvetica-Bold');
          Object.entries(data).forEach(([key, value]) => {
            doc.text(`${key.replace(/([A-Z])/g, ' $1').toUpperCase()}: `, { continued: true }).font('Helvetica').text(String(value));
            doc.moveDown();
          });
        }

        doc.end();
      } catch (error) {
        this.logger.error('Error generating PDF', error.stack);
        reject(error);
      }
    });
  }
}
