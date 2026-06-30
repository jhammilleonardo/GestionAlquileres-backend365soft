import { Controller, Get, Header, Query, Res, UseGuards } from '@nestjs/common';
import type { Response } from 'express';
import { ApiTags, ApiBearerAuth, ApiParam } from '@nestjs/swagger';
import { AuditLogsService } from './audit-logs.service';
import { QueryAuditLogsDto } from './dto/query-audit-logs.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Audit Logs')
@ApiBearerAuth()
@Controller(':slug/admin/audit-logs')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'SUPERADMIN')
export class AuditLogsController {
  constructor(private readonly auditLogsService: AuditLogsService) {}

  @Get()
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  findAll(@Query() filters: QueryAuditLogsDto) {
    return this.auditLogsService.findAll(filters);
  }

  @Get('export')
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @Header('Content-Type', 'text/csv; charset=utf-8')
  async exportCsv(
    @Query() filters: QueryAuditLogsDto,
    @Res({ passthrough: true }) res: Response,
  ): Promise<string> {
    const csv = await this.auditLogsService.exportCsv(filters);
    const date = new Date().toISOString().slice(0, 10);
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="auditoria-${date}.csv"`,
    );
    return csv;
  }
}
