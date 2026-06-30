import {
  BadRequestException,
  Body,
  Controller,
  DefaultValuePipe,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
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
import { AccountingDashboardService } from './accounting-dashboard.service';
import { AccountingBankReconciliationService } from './accounting-bank-reconciliation.service';
import { AccountingFinancialIntegrityService } from './accounting-financial-integrity.service';
import { AccountingQueriesService } from './accounting-queries.service';
import { AccountingReportsService } from './accounting-reports.service';
import { AccountingManualEntryService } from './accounting-manual-entry.service';
import { MatchBankTransactionDto } from './dto/match-bank-transaction.dto';
import { CreateJournalEntryDto } from './dto/create-journal-entry.dto';
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
    private readonly dashboardService: AccountingDashboardService,
    private readonly bankReconciliationService: AccountingBankReconciliationService,
    private readonly financialIntegrityService: AccountingFinancialIntegrityService,
    private readonly queriesService: AccountingQueriesService,
    private readonly reportsService: AccountingReportsService,
    private readonly manualEntryService: AccountingManualEntryService,
  ) {}

  @Get('dashboard')
  @RequirePermission('accounting', 'view')
  @ApiOperation({
    summary: 'Panel operativo contable con cobranza, pagos y reportes base',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Resumen operativo de contabilidad' })
  getDashboard(@Param('slug') slug: string, @Query() query: DateRangeQueryDto) {
    return this.dashboardService.getDashboard(slug, query);
  }

  @Post('bank-transactions/match')
  @RequirePermission('accounting', 'edit')
  @ApiOperation({
    summary: 'Conciliar transaccion bancaria con linea contable',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Transaccion conciliada' })
  matchBankTransaction(
    @Param('slug') slug: string,
    @Body() dto: MatchBankTransactionDto,
  ) {
    return this.bankReconciliationService.matchBankTransaction(
      slug,
      dto.bank_transaction_id,
      dto.journal_line_id,
    );
  }

  @Get('bank-transactions/open')
  @RequirePermission('accounting', 'view')
  @ApiOperation({
    summary: 'Transacciones bancarias pendientes de conciliación',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({
    description: 'Transacciones bancarias importadas y abiertas',
  })
  getOpenBankTransactions(
    @Param('slug') slug: string,
    @Query('bankAccountId') bankAccountId?: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
  ) {
    const parsedBankAccountId =
      bankAccountId === undefined || bankAccountId === ''
        ? null
        : Number(bankAccountId);
    if (
      parsedBankAccountId !== null &&
      (!Number.isInteger(parsedBankAccountId) || parsedBankAccountId < 1)
    ) {
      throw new BadRequestException(
        'bankAccountId debe ser un entero positivo.',
      );
    }

    return this.bankReconciliationService.getOpenTransactions(
      slug,
      parsedBankAccountId,
      limit,
    );
  }

  @Get('bank-transactions/:bankTransactionId/candidates')
  @RequirePermission('accounting', 'view')
  @ApiOperation({
    summary: 'Candidatos contables para conciliar una transacción bancaria',
  })
  @ApiParam({ name: 'slug' })
  @ApiParam({ name: 'bankTransactionId' })
  @ApiOkResponse({
    description: 'Líneas contables candidatas para conciliación',
  })
  getBankTransactionCandidates(
    @Param('slug') slug: string,
    @Param('bankTransactionId', ParseIntPipe) bankTransactionId: number,
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
  ) {
    return this.bankReconciliationService.getMatchCandidates(
      slug,
      bankTransactionId,
      limit,
    );
  }

  @Get('integrity')
  @RequirePermission('accounting', 'view')
  @ApiOperation({
    summary: 'Auditoría de integridad financiera del tenant',
    description:
      'Detecta pagos aprobados sin posteo, vínculos inválidos, reservas sobrepagadas, gastos descuadrados y asientos no balanceados.',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Reporte de integridad financiera' })
  getFinancialIntegrity(@Param('slug') slug: string) {
    return this.financialIntegrityService.getReport(slug);
  }

  @Post('integrity/reprocess-payments')
  @RequirePermission('accounting', 'edit')
  @ApiOperation({
    summary: 'Reprocesar posteos contables pendientes de pagos aprobados',
    description:
      'Recrea eventos idempotentes payment.approved para pagos aprobados sin asiento y ejecuta el outbox del tenant.',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Resultado de remediación financiera' })
  reprocessApprovedPayments(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.financialIntegrityService.reprocessApprovedPaymentPostings(
      slug,
      limit,
    );
  }

  @Post('integrity/reprocess-expenses')
  @RequirePermission('accounting', 'edit')
  @ApiOperation({
    summary: 'Reprocesar posteos contables pendientes de gastos',
    description:
      'Recrea eventos idempotentes para gastos base y pagos de proveedor sin asiento, y ejecuta el outbox del tenant.',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({
    description: 'Resultado de remediación financiera de gastos',
  })
  reprocessExpenses(
    @Param('slug') slug: string,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit: number,
  ) {
    return this.financialIntegrityService.reprocessExpensePostings(slug, limit);
  }

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

  @Post('journal-entries')
  @RequirePermission('accounting', 'edit')
  @ApiOperation({
    summary: 'Registrar un asiento contable manual (ajustes/reclasificaciones)',
    description:
      'Postea un asiento balanceado de doble partida. Valida cuadre exacto en ' +
      'centavos y existencia de las cuentas. El período debe estar abierto.',
  })
  @ApiParam({ name: 'slug' })
  @ApiOkResponse({ description: 'Asiento contable creado y posteado' })
  createJournalEntry(
    @Param('slug') slug: string,
    @Body() dto: CreateJournalEntryDto,
  ) {
    return this.manualEntryService.createManualEntry(slug, dto);
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
