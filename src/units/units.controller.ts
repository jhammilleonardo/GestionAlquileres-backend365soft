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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiBadRequestResponse,
  ApiOperation,
  ApiParam,
  ApiBearerAuth,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { UnitsService } from './units.service';
import { CreateUnitDto } from './dto/create-unit.dto';
import { UpdateUnitDto } from './dto/update-unit.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import {
  UnitDeleteResponseDto,
  UnitResponseDto,
} from './dto/unit-response.dto';

@ApiTags('Units - Admin')
@ApiBearerAuth()
@Controller(':slug/admin/properties/:propertyId/units')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN', 'EMPLEADO')
export class AdminUnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({ summary: 'Listar unidades de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiOkResponse({ type: UnitResponseDto, isArray: true })
  async findAll(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.unitsService.findByProperty(propertyId);
  }

  @Post()
  @ApiOperation({ summary: 'Crear una unidad en una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiBody({ type: CreateUnitDto })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiBadRequestResponse({ description: 'Datos de unidad inválidos' })
  async create(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Body() createUnitDto: CreateUnitDto,
  ) {
    return this.unitsService.create(propertyId, createUnitDto);
  }

  @Patch(':unitId')
  @ApiOperation({ summary: 'Actualizar una unidad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiBody({ type: UpdateUnitDto })
  @ApiOkResponse({ type: UnitResponseDto })
  @ApiNotFoundResponse({ description: 'Unidad no encontrada' })
  async update(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
    @Body() updateUnitDto: UpdateUnitDto,
  ) {
    return this.unitsService.update(propertyId, unitId, updateUnitDto);
  }

  @Delete(':unitId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Eliminar una unidad (solo si no tiene contratos activos)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiParam({ name: 'unitId', type: Number })
  @ApiOkResponse({ type: UnitDeleteResponseDto })
  @ApiBadRequestResponse({ description: 'Unidad tiene contratos activos' })
  @ApiNotFoundResponse({ description: 'Unidad no encontrada' })
  async remove(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
    @Param('unitId', ParseIntPipe) unitId: number,
  ) {
    return this.unitsService.remove(propertyId, unitId);
  }
}

@ApiTags('Units - Public Catalog')
@Controller(':slug/catalog/properties/:propertyId/units')
export class PublicUnitsController {
  constructor(private readonly unitsService: UnitsService) {}

  @Get()
  @ApiOperation({
    summary: 'Listar unidades disponibles de una propiedad (público, sin auth)',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'propertyId', type: Number })
  @ApiOkResponse({ type: UnitResponseDto, isArray: true })
  async findAvailable(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) propertyId: number,
  ) {
    return this.unitsService.findAvailableByProperty(propertyId);
  }
}
