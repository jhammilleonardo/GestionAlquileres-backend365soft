import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { AccountingQueriesService } from './accounting-queries.service';
import { AccountingReportsService } from './accounting-reports.service';
import {
  AsOfQueryDto,
  ChartOfAccountsQueryDto,
  DateRangeQueryDto,
  GeneralLedgerQueryDto,
  JournalEntriesQueryDto,
} from './dto/accounting-query.dto';

/**
 * API de solo-lectura de contabilidad (Fase F4). Expone el plan de cuentas, el
 * libro diario y los reportes financieros calculados desde el ledger. Los
 * asientos son inmutables: se postean por el motor (outbox), aquí solo se leen.
 */
@ApiTags('Accounting')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/accounting')
export class AccountingController {
  constructor(
    private readonly queriesService: AccountingQueriesService,
    private readonly reportsService: AccountingReportsService,
  ) {}

  @Get('chart-of-accounts')
  @RequirePermission('accounting', 'view')
  @ApiOperation({ summary: 'Plan de cuentas del tenant' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Listado de cuentas contables' })
  getChartOfAccounts(
    @Param('slug') slug: string,
    @Query() query: ChartOfAccountsQueryDto,
  ) {
    return this.queriesService.getChartOfAccounts(slug, query);
  }

  @Get('journal-entries')
  @RequirePermission('accounting', 'view')
  @ApiOperation({
    summary: 'Libro diario — asientos con sus líneas (paginado)',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Asientos contables paginados' })
  getJournalEntries(
    @Param('slug') slug: string,
    @Query() query: JournalEntriesQueryDto,
  ) {
    return this.queriesService.getJournalEntries(slug, query);
  }

  @Get('trial-balance')
  @RequirePermission('accounting', 'view')
  @ApiOperation({ summary: 'Balanza de comprobación' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Saldos deudores y acreedores por cuenta' })
  getTrialBalance(
    @Param('slug') slug: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.reportsService.getTrialBalance(slug, query);
  }

  @Get('general-ledger')
  @RequirePermission('accounting', 'view')
  @ApiOperation({ summary: 'Libro mayor de una cuenta (con saldo corriente)' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Movimientos y saldo de la cuenta' })
  getGeneralLedger(
    @Param('slug') slug: string,
    @Query() query: GeneralLedgerQueryDto,
  ) {
    return this.reportsService.getGeneralLedger(slug, query);
  }

  @Get('balance-sheet')
  @RequirePermission('accounting', 'view')
  @ApiOperation({ summary: 'Balance general a una fecha de corte' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Activos, pasivos y patrimonio' })
  getBalanceSheet(@Param('slug') slug: string, @Query() query: AsOfQueryDto) {
    return this.reportsService.getBalanceSheet(slug, query);
  }

  @Get('income-statement')
  @RequirePermission('accounting', 'view')
  @ApiOperation({ summary: 'Estado de resultados de un período' })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Ingresos, gastos y resultado neto' })
  getIncomeStatement(
    @Param('slug') slug: string,
    @Query() query: DateRangeQueryDto,
  ) {
    return this.reportsService.getIncomeStatement(slug, query);
  }
}
