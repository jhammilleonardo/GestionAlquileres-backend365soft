import { Controller, Get, Query, Res, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { ReportsService } from './reports.service';
import { ReportsExportService } from './reports-export.service';
import { ReportFilterDto, ReportFormat } from './dto/report-filter.dto';
import { ReportData } from './reports.types';
import {
  DelinquencyReportRowDto,
  ProfitAndLossReportRowDto,
  RentRollReportRowDto,
  ReportKpisResponseDto,
  VacancyReportRowDto,
} from './dto/report-response.dto';

@ApiTags('Admin Reports')
@ApiBearerAuth()
@ApiParam({ name: 'slug', description: 'Tenant slug' })
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/reports')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly exportService: ReportsExportService,
  ) {}

  @Get('rent-roll')
  @ApiOperation({ summary: 'Master Rent Roll Report' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiQuery({ type: ReportFilterDto })
  @ApiOkResponse({
    type: RentRollReportRowDto,
    isArray: true,
    description:
      'JSON por defecto. Si format=excel o format=pdf retorna archivo binario.',
  })
  @RequirePermission('reports', 'view')
  async getRentRoll(@Query() filters: ReportFilterDto, @Res() res: Response) {
    const data = await this.reportsService.getRentRoll(filters);
    return this.handleExport(res, data, 'Rent_Roll', filters.format);
  }

  @Get('vacancies')
  @ApiOperation({ summary: 'Vacancies Report' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiQuery({ type: ReportFilterDto })
  @ApiOkResponse({
    type: VacancyReportRowDto,
    isArray: true,
    description:
      'JSON por defecto. Si format=excel o format=pdf retorna archivo binario.',
  })
  @RequirePermission('reports', 'view')
  async getVacancies(@Query() filters: ReportFilterDto, @Res() res: Response) {
    const data = await this.reportsService.getVacancies(filters);
    return this.handleExport(res, data, 'Vacancies', filters.format);
  }

  @Get('delinquency')
  @ApiOperation({ summary: 'Delinquency Report' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiQuery({ type: ReportFilterDto })
  @ApiOkResponse({
    type: DelinquencyReportRowDto,
    isArray: true,
    description:
      'JSON por defecto. Si format=excel o format=pdf retorna archivo binario.',
  })
  @RequirePermission('reports', 'view')
  async getDelinquency(
    @Query() filters: ReportFilterDto,
    @Res() res: Response,
  ) {
    const data = await this.reportsService.getDelinquency(filters);
    return this.handleExport(res, data, 'Delinquency', filters.format);
  }

  @Get('pnl')
  @ApiOperation({ summary: 'Profit & Loss Report' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiQuery({ type: ReportFilterDto })
  @ApiOkResponse({
    type: ProfitAndLossReportRowDto,
    isArray: true,
    description:
      'JSON por defecto. Si format=excel o format=pdf retorna archivo binario.',
  })
  @RequirePermission('reports', 'view')
  async getPnL(@Query() filters: ReportFilterDto, @Res() res: Response) {
    const data = await this.reportsService.getPnL(filters);
    return this.handleExport(res, data, 'PnL', filters.format);
  }

  @Get('kpis')
  @ApiOperation({ summary: 'Key Performance Indicators Report' })
  @ApiProduces(
    'application/json',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/pdf',
  )
  @ApiQuery({ type: ReportFilterDto })
  @ApiOkResponse({
    type: ReportKpisResponseDto,
    description:
      'JSON por defecto. Si format=excel o format=pdf retorna archivo binario.',
  })
  @RequirePermission('reports', 'view')
  async getKpis(@Query() filters: ReportFilterDto, @Res() res: Response) {
    const data = await this.reportsService.getKpis(filters);
    return this.handleExport(res, data, 'KPIs', filters.format);
  }

  private async handleExport(
    res: Response,
    data: ReportData,
    reportName: string,
    format?: ReportFormat,
  ): Promise<Response> {
    if (format === ReportFormat.EXCEL) {
      const buffer = await this.exportService.toExcel(data, reportName);
      res.set({
        'Content-Type':
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename=${reportName}.xlsx`,
      });
      return res.send(buffer);
    }

    if (format === ReportFormat.PDF) {
      const buffer = await this.exportService.toPdf(data, reportName);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename=${reportName}.pdf`,
      });
      return res.send(buffer);
    }

    return res.json(data);
  }
}
