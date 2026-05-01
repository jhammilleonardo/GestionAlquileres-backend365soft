import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  ParseIntPipe,
  UseGuards,
  HttpCode,
  HttpStatus,
  Res,
  Query,
  BadRequestException,
} from '@nestjs/common';
import type { Response } from 'express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNotFoundResponse,
  ApiBadRequestResponse,
  ApiConflictResponse,
  ApiQuery,
} from '@nestjs/swagger';
import { RentalOwnersService } from './rental-owners.service';
import { OwnerStatementsService } from '../owner-statements/owner-statements.service';
import { CreateRentalOwnerDto } from './dto/create-rental-owner.dto';
import { UpdateRentalOwnerDto } from './dto/update-rental-owner.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

@ApiTags('Rental Owners')
@ApiBearerAuth()
@Controller(':slug/admin/rental-owners')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EMPLEADO')
export class RentalOwnersController {
  constructor(
    private readonly rentalOwnersService: RentalOwnersService,
    private readonly ownerStatementsService: OwnerStatementsService,
  ) {}

  /**
   * Lista todos los propietarios con cantidad de propiedades y saldo pendiente.
   */
  @Get()
  @ApiOperation({
    summary: 'Listar propietarios',
    description:
      'Retorna todos los propietarios con número de propiedades asignadas y saldo pendiente del mes en curso.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({
    description: 'Lista de propietarios con resumen financiero',
  })
  async findAll(@Param('slug') _slug: string) {
    return this.rentalOwnersService.findAll();
  }

  /**
   * Detalle de un propietario por ID.
   */
  @Get(':id')
  @ApiOperation({ summary: 'Obtener propietario por ID' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({
    description: 'Datos completos del propietario incluyendo banco',
  })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado' })
  async findOne(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rentalOwnersService.findOne(id);
  }

  /**
   * Crea un propietario con datos personales y, opcionalmente, datos bancarios.
   */
  @Post()
  @ApiOperation({
    summary: 'Crear propietario',
    description:
      'Crea un nuevo propietario. Los datos bancarios (bank_details) son opcionales y pueden completarse después.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiCreatedResponse({ description: 'Propietario creado exitosamente' })
  @ApiConflictResponse({ description: 'El email ya está registrado' })
  async create(
    @Param('slug') _slug: string,
    @Body() createDto: CreateRentalOwnerDto,
  ) {
    return this.rentalOwnersService.create(createDto);
  }

  /**
   * Actualiza datos personales y/o bancarios de un propietario.
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar propietario',
    description:
      'Actualiza campos del propietario. Enviar solo los campos a modificar (PATCH parcial). ' +
      'Para actualizar datos bancarios, incluir el objeto bank_details.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Propietario actualizado' })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado' })
  @ApiConflictResponse({
    description: 'El email ya está en uso por otro propietario',
  })
  async update(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateRentalOwnerDto,
  ) {
    return this.rentalOwnersService.update(id, updateDto);
  }

  /**
   * Desactiva (soft delete) un propietario.
   * Falla si el propietario tiene propiedades activas asignadas.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Desactivar propietario',
    description:
      'Realiza una baja lógica (is_active = false). ' +
      'Solo se permite si el propietario no tiene propiedades en estado DISPONIBLE, OCUPADO, RESERVADO o MANTENIMIENTO.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Propietario desactivado' })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado' })
  @ApiBadRequestResponse({ description: 'Tiene propiedades activas asignadas' })
  async deactivate(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rentalOwnersService.deactivate(id);
  }

  /**
   * Propiedades asignadas a un propietario con porcentaje de participación.
   */
  @Get(':id/properties')
  @ApiOperation({
    summary: 'Propiedades del propietario',
    description:
      'Lista todas las propiedades asignadas al propietario con su porcentaje de participación.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Lista de propiedades del propietario' })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado' })
  async getProperties(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rentalOwnersService.getProperties(id);
  }

  /**
   * Historial de liquidaciones/pagos agrupado por mes.
   * Los datos se derivan de la tabla payments hasta que exista una tabla
   * owner_statements dedicada (planificada para Fase 3).
   */
  @Get(':id/statements')
  @ApiOperation({
    summary: 'Historial de liquidaciones del propietario',
    description:
      'Retorna los pagos recibidos agrupados por mes y propiedad. ' +
      'Incluye monto total, confirmado y pendiente por período. ' +
      'Nota: en Fase 3 se reemplazará por una tabla owner_statements dedicada.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({
    description: 'Historial de pagos agrupado por período y propiedad',
  })
  @ApiNotFoundResponse({ description: 'Propietario no encontrado' })
  async getStatements(
    @Param('slug') _slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rentalOwnersService.getStatements(id);
  }

  @Post(':id/create-account')
  @ApiOperation({
    summary: 'Crear cuenta de acceso para el propietario',
    description: 'Genera credenciales de acceso para el propietario.',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Devuelve email y contraseña temporal' })
  async createAccount(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.rentalOwnersService.createOwnerAccount(id, slug);
  }
}
