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
} from '@nestjs/common';
import {
  ApiTags,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiOkResponse,
  ApiCreatedResponse,
  ApiNoContentResponse,
} from '@nestjs/swagger';
import { VendorsService } from './vendors.service';
import { CreateVendorDto, UpdateVendorDto, VendorFiltersDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

@ApiTags('Vendors - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/vendors')
export class VendorsController {
  constructor(private readonly vendorsService: VendorsService) {}

  @Get()
  @RequirePermission('vendors', 'view')
  @ApiOperation({ summary: 'Listar proveedores con filtros opcionales' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiOkResponse({ description: 'Lista de proveedores' })
  findAll(@Query() filters: VendorFiltersDto) {
    return this.vendorsService.findAll(filters);
  }

  @Get(':id')
  @RequirePermission('vendors', 'view')
  @ApiOperation({ summary: 'Obtener proveedor por ID con contador de órdenes' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Datos del proveedor' })
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.vendorsService.findOne(id);
  }

  @Post()
  @RequirePermission('vendors', 'create')
  @ApiOperation({ summary: 'Crear un nuevo proveedor externo' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiCreatedResponse({ description: 'Proveedor creado correctamente' })
  create(@Body() dto: CreateVendorDto, @CurrentUser() user: JwtUser) {
    return this.vendorsService.create(dto, user.userId);
  }

  @Patch(':id')
  @RequirePermission('vendors', 'edit')
  @ApiOperation({ summary: 'Actualizar datos del proveedor' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Proveedor actualizado' })
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateVendorDto) {
    return this.vendorsService.update(id, dto);
  }

  @Delete(':id')
  @RequirePermission('vendors', 'delete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Desactivar proveedor (soft delete)' })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Proveedor desactivado' })
  deactivate(@Param('id', ParseIntPipe) id: number) {
    return this.vendorsService.deactivate(id);
  }

  @Get(':id/history')
  @RequirePermission('vendors', 'view')
  @ApiOperation({
    summary: 'Historial de órdenes de mantenimiento asignadas al proveedor',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ description: 'Historial de órdenes' })
  getHistory(@Param('id', ParseIntPipe) id: number) {
    return this.vendorsService.getHistory(id);
  }
}
