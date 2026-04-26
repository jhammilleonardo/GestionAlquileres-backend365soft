import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiOkResponse,
  ApiCreatedResponse,
} from '@nestjs/swagger';
import { ReservationsService } from './reservations.service';
import { CreateReservationDto, BlockDatesDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

// ─── Catálogo público (sin autenticación) ─────────────────────────────────

@ApiTags('Reservations - Catalog')
@Controller(':slug/catalog/properties/:id/availability')
export class PublicAvailabilityController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Get()
  @ApiOperation({ summary: 'Disponibilidad mensual de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number, description: 'ID de la propiedad' })
  @ApiQuery({ name: 'month', required: true, example: '2026-05', description: 'Mes en formato YYYY-MM' })
  @ApiQuery({ name: 'unit_id', required: false, type: Number, description: 'Filtrar por unidad específica' })
  @ApiOkResponse({ description: 'Array de fechas con su estado de disponibilidad' })
  async getAvailability(
    @Param('id', ParseIntPipe) propertyId: number,
    @Query('month') month: string,
    @Query('unit_id') unitId?: string,
  ) {
    return this.reservationsService.getMonthAvailability(
      propertyId,
      month,
      unitId ? parseInt(unitId, 10) : undefined,
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
  @ApiOkResponse({ description: 'Fechas bloqueadas correctamente' })
  async blockDates(
    @Param('id', ParseIntPipe) propertyId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() dto: BlockDatesDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.blockDates(propertyId, unitId, dto, user.userId);
  }
}

// ─── Portal inquilino ─────────────────────────────────────────────────────

@ApiTags('Reservations - Tenant')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller(':slug/tenant/reservations')
export class TenantReservationsController {
  constructor(private readonly reservationsService: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Crear una reserva de corto plazo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiCreatedResponse({ description: 'Reserva creada correctamente' })
  async create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: JwtUser,
  ) {
    return this.reservationsService.createReservation(dto, user.userId);
  }
}
