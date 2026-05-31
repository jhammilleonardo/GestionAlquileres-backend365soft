import * as ExcelJS from 'exceljs';
import { ReportsExportService } from './reports-export.service';
import { ReportKpis, ReportTable } from './reports.types';

describe('ReportsExportService', () => {
  let service: ReportsExportService;

  beforeEach(() => {
    service = new ReportsExportService();
  });

  it('exports table data to Excel with generated headers', async () => {
    const rows: ReportTable = [
      {
        property_id: 1,
        property_name: 'Casa Centro',
        net_result: '10998.00',
      },
    ];

    const buffer = await service.toExcel(rows, 'PnL');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet('PnL');
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('PROPERTY ID');
    expect(worksheet?.getCell('B1').value).toBe('PROPERTY NAME');
    expect(worksheet?.getCell('A2').value).toBe(1);
    expect(worksheet?.getCell('B2').value).toBe('Casa Centro');
    expect(worksheet?.getCell('C2').value).toBe('10998.00');
  });

  it('exports table data to Excel preserving dates, booleans and empty cells', async () => {
    const generatedAt = new Date('2026-05-01T00:00:00.000Z');
    const rows: ReportTable = [
      {
        property_name: 'Casa Centro',
        generated_at: generatedAt,
        is_active: true,
        notes: null,
      },
    ];

    const buffer = await service.toExcel(rows, 'Audit');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet('Audit');
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('PROPERTY NAME');
    expect(worksheet?.getCell('B1').value).toBe('GENERATED AT');
    expect(worksheet?.getCell('C1').value).toBe('IS ACTIVE');
    expect(worksheet?.getCell('A2').value).toBe('Casa Centro');
    expect(worksheet?.getCell('B2').value).toEqual(generatedAt);
    expect(worksheet?.getCell('C2').value).toBe(true);
    expect(worksheet?.getCell('D2').value).toBeNull();
  });

  it('exports KPI data to Excel as metric/value rows', async () => {
    const kpis: ReportKpis = {
      occupancyRate: '80.00%',
      occupancyRateValue: 0.8,
      totalUnits: 10,
      occupiedUnits: 8,
      availableUnits: 2,
      monthlyIncome: 10000,
      monthlyIncomePrevious: 9000,
      pendingPaymentsCount: 2,
      delinquentCount: 1,
      activeMaintenanceCount: 1,
      expiringContracts: 0,
    };

    const buffer = await service.toExcel(kpis, 'KPIs');
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.load(buffer);

    const worksheet = workbook.getWorksheet('KPIs');
    expect(worksheet).toBeDefined();
    expect(worksheet?.getCell('A1').value).toBe('METRIC');
    expect(worksheet?.getCell('B1').value).toBe('VALUE');
    expect(worksheet?.getCell('A2').value).toBe('OCCUPANCY RATE');
    expect(worksheet?.getCell('B2').value).toBe('80.00%');
  });

  it('exports PDF buffers for table and KPI reports', async () => {
    const rows: ReportTable = [{ property_name: 'Casa Centro', income: 1000 }];
    const kpis: ReportKpis = {
      occupancyRate: '100.00%',
      occupancyRateValue: 1,
      totalUnits: 1,
      occupiedUnits: 1,
      availableUnits: 0,
      monthlyIncome: 1000,
      monthlyIncomePrevious: 800,
      pendingPaymentsCount: 0,
      delinquentCount: 0,
      activeMaintenanceCount: 0,
      expiringContracts: 0,
    };

    const tablePdf = await service.toPdf(rows, 'Rent_Roll');
    const kpiPdf = await service.toPdf(kpis, 'KPIs');

    expect(tablePdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(kpiPdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(tablePdf.length).toBeGreaterThan(500);
    expect(kpiPdf.length).toBeGreaterThan(500);
  });

  it('exports empty table reports to PDF without failing', async () => {
    const pdf = await service.toPdf([], 'Vacancies');

    expect(pdf.subarray(0, 4).toString()).toBe('%PDF');
    expect(pdf.length).toBeGreaterThan(500);
  });
});
