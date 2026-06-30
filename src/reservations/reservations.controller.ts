import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Request,
  Res,
  Headers,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { OptionalPositiveIntPipe } from '../common/pipes/optional-positive-int.pipe';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiBody,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiNotFoundResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { ReservationsService } from './reservations.service';
import { ReservationsAdminService } from './reservations-admin.service';
import { ReservationAnalyticsService } from './reservation-analytics.service';
import { IcalService } from './ical/ical.service';
import { SeasonRulesService } from './season-rules.service';
import { CreateSeasonRuleDto } from './dto/create-season-rule.dto';
import { CalendarSyncService } from './ical/calendar-sync.service';
import { CreateSyncSourceDto } from './dto/create-sync-source.dto';
import { QuoteService } from './quote.service';
import {
  CreateReservationDto,
  BlockDatesDto,
  ExtendReservationDto,
} from './dto';
import { ListReservationsDto } from './dto/list-reservations.dto';
import { UpdateReservationStatusDto } from './dto/update-reservation-status.dto';
import { QuoteRequestDto } from './dto/quote-request.dto';
import { AnalyticsQueryDto } from './dto/analytics-query.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import {
  BlockDatesResponseDto,
  DayAvailabilityResponseDto,
  ReservationResponseDto,
} from './dto/reservation-response.dto';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

function resolveSchema(req: TenantRequest, slug: string): string {
  return req.tenant?.schema_name ?? `tenant_${slug}`;
}

// ─── Catálogo público (sin autenticación) ─────────────────────────────────

@ApiTags('Reservations - Catalog')
@Controller(':slug/catalog/properties/:id/availability')
export class PublicAvailabilityController {
  constructor(private readonly reservationsService: ReservationsService) {}

  // Consulta pública de solo lectura y alto tráfico: límite ampliado a 600/min.
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Get()
  @ApiOperation({ summary: 'Disponibilidad mensual de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la propiedad' })
  @ApiQuery({
    name: 'month',
    required: true,
    example: '2026-05',
    description: 'Mes en formato YYYY-MM',
  })
  @ApiQuery({
    name: 'unit_id',
    required: false,
    type: Number,
    description: 'Filtrar por unidad específica',
  })
  @ApiOkResponse({
    description: 'Array de fechas con su estado de disponibilidad',
    type: DayAvailabilityResponseDto,
    isArray: true,
  })
  @ApiBadRequestResponse({ description: 'Mes inválido' })
  async getAvailability(
    @Param('id', ParseIntPipe) propertyId: number,
    @Query('month') month: string,
    @Query('unit_id', OptionalPositiveIntPipe) unitId?: number,
  ) {
    return this.reservationsService.getMonthAvailability(
      propertyId,
      month,
      unitId,
    );
  }
}

// ─── Admin ────────────────────────────────────────────────────────────────

@ApiTags('Reservations - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/properties/:id/units/:unitId/block-dates')
export class AdminReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @RequirePermission('reservations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Bloquear fechas manualmente en una unidad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la propiedad' })
  @ApiParam({ name: 'unitId', type: Number, description: 'ID de la unidad' })
  @ApiBody({ type: BlockDatesDto })
  @ApiOkResponse({ type: BlockDatesResponseDto })
  @ApiBadRequestResponse({
    description: 'Unidad no habilitada para corto plazo',
  })
  @ApiConflictResponse({ description: 'Una o más fechas ya están reservadas' })
  @ApiNotFoundResponse({ description: 'Unidad no encontrada' })
  async blockDates(
    @Param('id', ParseIntPipe) propertyId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: BlockDatesDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.blockDates(
      propertyId,
      unitId,
      dto,
      user.userId,
    );
  }
}

// ─── Catálogo público — cotización ────────────────────────────────────────

@ApiTags('Reservations - Quote')
@Controller(':slug/catalog/properties/:id/units/:unitId/quote')
export class PublicQuoteController {
  constructor(private readonly quoteService: QuoteService) {}

  // Cálculo público de solo lectura y alto tráfico: límite ampliado.
  @Throttle({ default: { limit: 600, ttl: 60000 } })
  @Post()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cotizar una reserva (desglose de precio)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la propiedad' })
  @ApiParam({ name: 'unitId', type: Number, description: 'ID de la unidad' })
  @ApiBody({ type: QuoteRequestDto })
  @ApiBadRequestResponse({ description: 'Fechas inválidas o fuera de rango' })
  @ApiNotFoundResponse({ description: 'Unidad no encontrada' })
  async getQuote(
    @Param('id', ParseIntPipe) propertyId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: QuoteRequestDto,
  ) {
    return this.quoteService.getQuote(propertyId, unitId, dto);
  }
}

// ─── Admin — gestión de reservas ──────────────────────────────────────────

@ApiTags('Reservations - Admin Management')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/reservations')
export class AdminReservationManagementController {
  constructor(
    private readonly reservationsAdminService: ReservationsAdminService,
    private readonly analyticsService: ReservationAnalyticsService,
  ) {}

  @Get()
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Listar reservas con filtros' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  async findAll(@Query() filters: ListReservationsDto) {
    return this.reservationsAdminService.findAll(filters);
  }

  // Debe ir ANTES de ':id' para que 'analytics' no se interprete como un id.
  @Get('analytics')
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Métricas de ocupación e ingresos por rango' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  async analytics(@Query() query: AnalyticsQueryDto) {
    return this.analyticsService.getOverview(query);
  }

  @Get(':id')
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Detalle de una reserva' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiNotFoundResponse({ description: 'Reserva no encontrada' })
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.reservationsAdminService.findOne(id);
  }

  @Patch(':id/status')
  @RequirePermission('reservations', 'edit')
  @ApiOperation({
    summary: 'Transición de estado (confirmar/cancelar/no-show/completar)',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiBody({ type: UpdateReservationStatusDto })
  @ApiConflictResponse({ description: 'Transición de estado no permitida' })
  @ApiNotFoundResponse({ description: 'Reserva no encontrada' })
  async updateStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateReservationStatusDto,
    @CurrentUser() user: JwtUser,
    @Request() req: TenantRequest,
  ) {
    return this.reservationsAdminService.transition(
      id,
      dto,
      user.userId,
      resolveSchema(req, user.tenantSlug),
      user.tenantSlug,
    );
  }
}

// ─── Portal inquilino ─────────────────────────────────────────────────────

@ApiTags('Reservations - Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/tenant/reservations')
export class TenantReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar mis reservas' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ type: ReservationResponseDto, isArray: true })
  async findMine(@CurrentUser() user: JwtUser) {
    return this.reservationsService.findMyReservations(user.userId);
  }

  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({ summary: 'Crear una reserva de corto plazo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiBody({ type: CreateReservationDto })
  @ApiCreatedResponse({ type: ReservationResponseDto })
  @ApiBadRequestResponse({
    description: 'Fechas inválidas o corto plazo deshabilitado',
  })
  @ApiConflictResponse({ description: 'Fechas no disponibles' })
  @ApiNotFoundResponse({ description: 'Unidad no encontrada' })
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: JwtUser,
    @Request() req: TenantRequest,
    @Headers('idempotency-key') idempotencyKey?: string,
  ) {
    const normalizedKey = idempotencyKey?.trim();
    if (
      normalizedKey &&
      !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,99}$/.test(normalizedKey)
    ) {
      throw new BadRequestException(
        'Idempotency-Key debe tener entre 8 y 100 caracteres seguros',
      );
    }

    return this.reservationsService.createReservation(
      dto,
      user.userId,
      resolveSchema(req, user.tenantSlug),
      user.tenantSlug,
      normalizedKey,
    );
  }

  @Post(':id/extension-quote')
  @ApiOperation({ summary: 'Cotizar la extensión de una reserva propia' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiBody({ type: ExtendReservationDto })
  @ApiConflictResponse({ description: 'Noches adicionales no disponibles' })
  async quoteExtension(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendReservationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.quoteExtension(
      id,
      user.userId,
      dto.checkout_date,
    );
  }

  @Patch(':id/extend')
  @ApiOperation({
    summary: 'Extender la fecha de salida de una reserva propia',
  })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiBody({ type: ExtendReservationDto })
  @ApiConflictResponse({ description: 'Noches adicionales no disponibles' })
  async extendMine(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ExtendReservationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.extendReservation(
      id,
      user.userId,
      dto.checkout_date,
    );
  }

  @Get(':id/cancellation-preview')
  @ApiOperation({
    summary: 'Previsualizar el reembolso si se cancela ahora',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiNotFoundResponse({ description: 'Reserva no encontrada' })
  async cancellationPreview(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.getCancellationPreview(id, user.userId);
  }

  @Patch(':id/cancel')
  @ApiOperation({ summary: 'Cancelar una reserva propia' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la reserva' })
  @ApiOkResponse({ type: ReservationResponseDto })
  @ApiConflictResponse({ description: 'La reserva no se puede cancelar' })
  @ApiNotFoundResponse({ description: 'Reserva no encontrada' })
  async cancelMine(
    @Param('id', ParseIntPipe) id: number,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.cancelMyReservation(id, user.userId);
  }
}

// ─── Admin — exportación de calendario (iCal) ─────────────────────────────────

@ApiTags('Reservations - Calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/units/:unitId/calendar.ics')
export class AdminUnitCalendarController {
  constructor(private readonly icalService: IcalService) {}

  @Get()
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Exportar el calendario de ocupación (iCal)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number, description: 'ID de la unidad' })
  async export(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Res() res: Response,
  ) {
    const ics = await this.icalService.buildUnitCalendar(unitId);
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="unit-${unitId}.ics"`,
    );
    res.send(ics);
  }
}

// ─── Admin — temporadas (tarifas por rango de fechas) ─────────────────────────

@ApiTags('Reservations - Seasons')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/units/:unitId/seasons')
export class AdminUnitSeasonsController {
  constructor(private readonly seasonRulesService: SeasonRulesService) {}

  @Get()
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Listar temporadas de una unidad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  async findAll(@Param('unitId', ParseIntPipe) unitId: number) {
    return this.seasonRulesService.findByUnit(unitId);
  }

  @Post()
  @RequirePermission('reservations', 'edit')
  @ApiOperation({ summary: 'Crear una temporada' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiBody({ type: CreateSeasonRuleDto })
  @ApiConflictResponse({ description: 'La temporada se solapa con otra' })
  async create(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: CreateSeasonRuleDto,
  ) {
    return this.seasonRulesService.create(unitId, dto);
  }

  @Delete(':id')
  @RequirePermission('reservations', 'edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar una temporada' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiNotFoundResponse({ description: 'Temporada no encontrada' })
  async remove(
    @Param('unitId', ParseIntPipe) unitId: number,
    @Param('id', ParseIntPipe) id: number,
  ) {
    await this.seasonRulesService.remove(unitId, id);
  }
}

// ─── Admin — sincronización de calendarios externos (iCal import) ─────────────

@ApiTags('Reservations - Calendar Sync')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/units/:unitId/calendar-sources')
export class AdminCalendarSyncController {
  constructor(private readonly calendarSyncService: CalendarSyncService) {}

  @Get()
  @RequirePermission('reservations', 'view')
  @ApiOperation({ summary: 'Listar calendarios externos de una unidad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  async list(
    @Param('slug') slug: string,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Request() req: TenantRequest,
  ) {
    return this.calendarSyncService.listSources(
      resolveSchema(req, slug),
      unitId,
    );
  }

  @Post()
  @RequirePermission('reservations', 'edit')
  @ApiOperation({ summary: 'Registrar un calendario externo (URL iCal)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiBody({ type: CreateSyncSourceDto })
  async create(
    @Param('slug') slug: string,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: CreateSyncSourceDto,
    @Request() req: TenantRequest,
  ) {
    return this.calendarSyncService.createSource(
      resolveSchema(req, slug),
      unitId,
      dto,
    );
  }

  @Post(':id/sync')
  @RequirePermission('reservations', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sincronizar ahora un calendario externo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  async sync(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const blocked = await this.calendarSyncService.syncSource(
      resolveSchema(req, slug),
      id,
    );
    return { blocked };
  }

  @Delete(':id')
  @RequirePermission('reservations', 'edit')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Eliminar un calendario externo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiParam({ name: 'id', type: Number })
  @ApiNotFoundResponse({ description: 'Fuente no encontrada' })
  async remove(
    @Param('slug') slug: string,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    await this.calendarSyncService.removeSource(
      resolveSchema(req, slug),
      unitId,
      id,
    );
  }
}
