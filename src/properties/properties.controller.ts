import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
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
import { CreatePropertyDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';
import { FilterPropertiesDto } from './dto/filter-properties.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { multerConfig } from '../common/utils/multer.config';

// Admin Controller - Gestión completa de propiedades
@ApiTags('Properties - Admin')
@ApiBearerAuth()
@Controller(':slug/admin')
@UseGuards(JwtAuthGuard)
export class AdminPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  // CRUD Properties
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

  // Property Details (edición posterior)
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

  // Upload Images
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

    // Get current property
    const property = await this.propertiesService.findOne(id);

    // Add new image URL to images array
    // file.path = /abs/path/to/storage/properties/{tenant}/{id}/filename.ext
    // We store the path relative to cwd: /storage/properties/{tenant}/{id}/filename.ext
    const images = Array.isArray(property.images) ? [...property.images] : [];
    const imageUrl = file.path.replace(process.cwd(), '').replace(/\\/g, '/');
    images.push(imageUrl);

    // Update property
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

  // Property Types and Subtypes
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

  // Rental Owners
  @Post('rental-owners')
  @ApiOperation({ summary: 'Crear propietario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async createRentalOwner(@Param('slug') slug: string, @Body() ownerDto: any) {
    return this.propertiesService.createRentalOwner(ownerDto);
  }

  @Get('rental-owners')
  @ApiOperation({ summary: 'Obtener todos los propietarios' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async getRentalOwners(@Param('slug') slug: string) {
    return this.propertiesService.getRentalOwners();
  }

  @Get('rental-owners/:id')
  @ApiOperation({ summary: 'Obtener un propietario' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async getRentalOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.getRentalOwner(id);
  }
}

// Catálogo Público - Propiedades disponibles para todos
@ApiTags('Properties - Public Catalog')
@Controller(':slug/catalog')
export class PublicPropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Get('properties')
  @ApiOperation({ summary: 'Obtener propiedades disponibles (público)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  async findAvailable(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
  ) {
    return this.propertiesService.findAvailable(filters, slug);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener detalle de propiedad (público)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id, slug);
  }
}

// Tenant Controller - Gestión de propiedades para inquilinos
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
  ) {
    return this.propertiesService.findAll(filters);
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
