import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  ParseIntPipe,
  UseInterceptors,
  UploadedFile,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import {
  CreatePropertyDto,
  CreateRentalOwnerDto,
  UpdateRentalOwnerDto,
  AssignOwnerDto,
} from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';
import { FilterPropertiesDto } from './dto/filter-properties.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { multerConfig } from '../common/utils/multer.config';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

// Admin Controller - Gestion completa de propiedades
@ApiTags('Properties - Admin')
@ApiBearerAuth()
@Controller(':slug/admin')
@UseGuards(JwtAuthGuard)
export class AdminPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  // =============================================
  // Stats / Dashboard
  // =============================================

  @Get('properties/stats')
  @ApiOperation({ summary: 'Obtener estadisticas de propiedades' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getStats(@Param('slug') slug: string) {
    return this.propertiesService.getStats();
  }

  // =============================================
  // CRUD Properties
  // =============================================

  @Post('properties')
  @ApiOperation({ summary: 'Crear una nueva propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async create(
    @Param('slug') slug: string,
    @Body() createPropertyDto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(createPropertyDto);
  }

  @Get('properties')
  @ApiOperation({ summary: 'Obtener todas las propiedades' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAll(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
  ) {
    return this.propertiesService.findAll(filters);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener una propiedad por ID' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id);
  }

  @Patch('properties/:id')
  @ApiOperation({ summary: 'Actualizar una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto);
  }

  @Delete('properties/:id')
  @ApiOperation({ summary: 'Eliminar una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async remove(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.remove(id);
  }

  // =============================================
  // Property Details
  // =============================================

  @Patch('properties/:id/details')
  @ApiOperation({ summary: 'Actualizar detalles de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async updateDetails(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDetailsDto: UpdatePropertyDetailsDto,
  ) {
    return this.propertiesService.updateDetails(id, updateDetailsDto);
  }

  // =============================================
  // Property Images
  // =============================================

  @Post('properties/:id/images')
  @ApiOperation({ summary: 'Subir imagen de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadImage(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    const property = await this.propertiesService.findOne(id);
    const images = Array.isArray(property.images) ? [...property.images] : [];
    const imageUrl = file.path
      .replace(process.cwd(), '')
      .replace(/\\/g, '/')
      .replace(/^\//, ''); // Remove leading slash
    images.push(imageUrl);

    return this.propertiesService.updateDetails(id, { images });
  }

  @Delete('properties/:id/images')
  @ApiOperation({ summary: 'Eliminar imagen de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async removeImage(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { image_url: string },
  ) {
    const property = await this.propertiesService.findOne(id);
    const images = property.images || [];

    const index = images.indexOf(body.image_url);
    if (index > -1) {
      images.splice(index, 1);
    }

    return this.propertiesService.updateDetails(id, { images });
  }

  // =============================================
  // Property Owners (asociacion propiedad-dueno)
  // =============================================

  @Post('properties/:id/owners')
  @ApiOperation({ summary: 'Asignar propietario a una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async assignOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDto: AssignOwnerDto,
  ) {
    return this.propertiesService.assignOwnerToProperty(id, assignDto);
  }

  @Delete('properties/:id/owners/:ownerRelationId')
  @ApiOperation({ summary: 'Desasociar propietario de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'ownerRelationId', type: Number })
  async removeOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('ownerRelationId', ParseIntPipe) ownerRelationId: number,
  ) {
    return this.propertiesService.removeOwnerFromProperty(id, ownerRelationId);
  }

  // =============================================
  // Property Types and Subtypes
  // =============================================

  @Get('property-types')
  @ApiOperation({ summary: 'Obtener tipos de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getPropertyTypes(@Param('slug') slug: string) {
    return this.propertiesService.getPropertyTypes();
  }

  @Get('property-subtypes')
  @ApiOperation({ summary: 'Obtener subtipos de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'typeId', required: false, type: Number })
  async getPropertySubtypes(
    @Param('slug') slug: string,
    @Query('typeId') typeId?: number,
  ) {
    return this.propertiesService.getPropertySubtypes(
      typeId ? +typeId : undefined,
    );
  }

  // =============================================
  // Rental Owners CRUD
  // =============================================

  @Post('rental-owners')
  @ApiOperation({ summary: 'Crear propietario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async createRentalOwner(
    @Param('slug') slug: string,
    @Body() ownerDto: CreateRentalOwnerDto,
  ) {
    return this.propertiesService.createRentalOwner(ownerDto);
  }

  @Get('rental-owners')
  @ApiOperation({ summary: 'Obtener todos los propietarios' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getRentalOwners(@Param('slug') slug: string) {
    return this.propertiesService.getRentalOwners();
  }

  @Get('rental-owners/:id')
  @ApiOperation({ summary: 'Obtener un propietario con sus propiedades' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getRentalOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.getRentalOwner(id);
  }

  @Patch('rental-owners/:id')
  @ApiOperation({ summary: 'Actualizar propietario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async updateRentalOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDto: UpdateRentalOwnerDto,
  ) {
    return this.propertiesService.updateRentalOwner(id, updateDto);
  }

  @Delete('rental-owners/:id')
  @ApiOperation({ summary: 'Eliminar propietario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async removeRentalOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.removeRentalOwner(id);
  }
}

// Catalogo Publico - Propiedades disponibles para todos
@ApiTags('Properties - Public Catalog')
@Controller(':slug/catalog')
export class PublicPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('properties')
  @ApiOperation({ summary: 'Obtener propiedades disponibles (publico)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAvailable(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
  ) {
    return this.propertiesService.findAvailable(filters);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener detalle de propiedad (publico)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id);
  }
}

// Tenant Controller - Gestion de propiedades para inquilinos
@ApiTags('Properties - Tenant')
@ApiBearerAuth()
@Controller(':slug/tenant')
@UseGuards(JwtAuthGuard)
export class TenantPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('properties')
  @ApiOperation({ summary: 'Obtener propiedades del inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAll(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
    @Req() req: TenantRequest,
  ) {
    return this.propertiesService.findByTenant(req.user!.userId, filters);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener una propiedad del inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id);
  }
}
