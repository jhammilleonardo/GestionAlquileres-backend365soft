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
  Res,
  Logger,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PropertiesService } from './properties.service';
import { OwnerStatementsService } from '../owner-statements/owner-statements.service';
import { CreatePropertyDto, AssignOwnerDto } from './dto/create-property.dto';
import { UpdatePropertyDto } from './dto/update-property.dto';
import { UpdatePropertyDetailsDto } from './dto/update-property-details.dto';
import { FilterPropertiesDto } from './dto/filter-properties.dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { OptionalPositiveIntPipe } from '../common/pipes/optional-positive-int.pipe';
import { multerConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';
import { StorageService } from '../common/storage/storage.service';
import {
  PaginatedPropertiesResponseDto,
  PropertyDetailResponseDto,
  PropertyImageDeleteDto,
  PropertyMutationMessageResponseDto,
  PropertyStatsResponseDto,
} from './dto/property-response.dto';
import {
  CatalogPropertyDetailResponseDto,
  PaginatedCatalogPropertiesResponseDto,
} from './dto/catalog-property-response.dto';

// Admin Controller - Gestion completa de propiedades
@ApiTags('Properties - Admin')
@ApiBearerAuth()
@Controller(':slug/admin')
@UseGuards(JwtAuthGuard, PermissionsGuard)
export class AdminPropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly storageService: StorageService,
  ) {}

  // =============================================
  // Stats / Dashboard
  // =============================================

  @Get('properties/stats')
  @RequirePermission('properties', 'view')
  @ApiOperation({ summary: 'Obtener estadisticas de propiedades' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: PropertyStatsResponseDto })
  async getStats(@Param('slug') slug: string) {
    return this.propertiesService.getStats(slug);
  }

  // =============================================
  // CRUD Properties
  // =============================================

  @Post('properties')
  @RequirePermission('properties', 'create')
  @ApiOperation({ summary: 'Crear una nueva propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CreatePropertyDto })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  async create(
    @Param('slug') slug: string,
    @Body() createPropertyDto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(slug, createPropertyDto);
  }

  @Get('properties')
  @RequirePermission('properties', 'view')
  @ApiOperation({ summary: 'Obtener todas las propiedades' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'property_type_id', required: false, type: Number })
  @ApiQuery({ name: 'property_subtype_id', required: false, type: Number })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'country', required: false })
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'min_rent', required: false, type: Number })
  @ApiQuery({ name: 'max_rent', required: false, type: Number })
  @ApiQuery({ name: 'page', required: false, type: Number })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiOkResponse({ type: PaginatedPropertiesResponseDto })
  async findAll(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
  ) {
    return this.propertiesService.findAll(filters, slug);
  }

  @Get('properties/:id')
  @RequirePermission('properties', 'view')
  @ApiOperation({ summary: 'Obtener una propiedad por ID' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id, slug);
  }

  @Patch('properties/:id')
  @RequirePermission('properties', 'edit')
  @ApiOperation({ summary: 'Actualizar una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdatePropertyDto })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async update(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updatePropertyDto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(id, updatePropertyDto, slug);
  }

  @Delete('properties/:id')
  @RequirePermission('properties', 'delete')
  @ApiOperation({ summary: 'Eliminar una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PropertyMutationMessageResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async remove(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.remove(id, slug);
  }

  // =============================================
  // Property Details
  // =============================================

  @Patch('properties/:id/details')
  @RequirePermission('properties', 'edit')
  @ApiOperation({ summary: 'Actualizar detalles de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdatePropertyDetailsDto })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async updateDetails(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() updateDetailsDto: UpdatePropertyDetailsDto,
  ) {
    return this.propertiesService.updateDetails(id, updateDetailsDto, slug);
  }

  // =============================================
  // Property Images
  // =============================================

  @Post('properties/:id/images')
  @RequirePermission('properties', 'edit')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({ summary: 'Subir imagen de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
      },
    },
  })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  @UseInterceptors(FileInterceptor('file', multerConfig))
  async uploadImage(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @UploadedFile() file: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    await assertUploadedFilesMatchContent(file);

    const property = await this.propertiesService.findOne(id, slug);
    const images = Array.isArray(property.images) ? [...property.images] : [];
    const imageStoragePath = await this.storageService.persistUploadedFile(
      file,
      this.storageService.buildStoragePath(
        'properties',
        slug,
        String(id),
        file.filename,
      ),
      'public',
    );
    const imageUrl = imageStoragePath.replace(/^\/+/, '');
    images.push(imageUrl);

    return this.propertiesService.updateDetails(id, { images }, slug);
  }

  @Delete('properties/:id/images')
  @RequirePermission('properties', 'edit')
  @ApiOperation({ summary: 'Eliminar imagen de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: PropertyImageDeleteDto })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async removeImage(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() body: { image_url: string },
  ) {
    const property = await this.propertiesService.findOne(id, slug);
    const images = property.images || [];

    const index = images.indexOf(body.image_url);
    if (index > -1) {
      images.splice(index, 1);
    }

    return this.propertiesService.updateDetails(id, { images }, slug);
  }

  // =============================================
  // Property Owners (asociacion propiedad-dueno)
  // =============================================

  @Post('properties/:id/owners')
  @RequirePermission('properties', 'edit')
  @ApiOperation({ summary: 'Asignar propietario a una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: AssignOwnerDto })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad o propietario no encontrado' })
  async assignOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() assignDto: AssignOwnerDto,
  ) {
    return this.propertiesService.assignOwnerToProperty(id, assignDto, slug);
  }

  @Delete('properties/:id/owners/:ownerRelationId')
  @RequirePermission('properties', 'edit')
  @ApiOperation({ summary: 'Desasociar propietario de una propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiParam({ name: 'ownerRelationId', type: Number })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Relación de propietario no encontrada' })
  async removeOwner(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Param('ownerRelationId', ParseIntPipe) ownerRelationId: number,
  ) {
    return this.propertiesService.removeOwnerFromProperty(
      id,
      ownerRelationId,
      slug,
    );
  }

  // =============================================
  // Property Types and Subtypes
  // =============================================

  @Get('property-types')
  @RequirePermission('properties', 'view')
  @ApiOperation({ summary: 'Obtener tipos de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: Object, isArray: true })
  async getPropertyTypes(@Param('slug') slug: string) {
    return this.propertiesService.getPropertyTypes(slug);
  }

  @Get('property-subtypes')
  @RequirePermission('properties', 'view')
  @ApiOperation({ summary: 'Obtener subtipos de propiedad' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'typeId', required: false, type: Number })
  @ApiOkResponse({ type: Object, isArray: true })
  async getPropertySubtypes(
    @Param('slug') slug: string,
    @Query('typeId', OptionalPositiveIntPipe) typeId?: number,
  ) {
    return this.propertiesService.getPropertySubtypes(slug, typeId);
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
  @ApiOkResponse({ type: PaginatedCatalogPropertiesResponseDto })
  async findAvailable(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
  ) {
    return this.propertiesService.findAvailable(filters, slug);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener detalle de propiedad (publico)' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: CatalogPropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id, slug);
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
  @ApiOkResponse({ type: Object, isArray: true })
  async findAll(
    @Param('slug') slug: string,
    @Query() filters: FilterPropertiesDto,
    @Req() req: TenantRequest,
  ) {
    return this.propertiesService.findByTenant(req.user!.userId, filters, slug);
  }

  @Get('properties/:id')
  @ApiOperation({ summary: 'Obtener una propiedad del inquilino' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PropertyDetailResponseDto })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.propertiesService.findOne(id, slug);
  }
}

// Owner Portal Controller - Acceso propietario a sus statements desde propiedades
@ApiTags('Properties - Owner Portal')
@ApiBearerAuth()
@Controller(':slug/owner/properties')
@UseGuards(JwtAuthGuard)
export class OwnerPropertiesPortalController {
  private readonly logger = new Logger(OwnerPropertiesPortalController.name);

  constructor(
    private readonly ownerStatementsService: OwnerStatementsService,
  ) {}

  /**
   * GET /:slug/owner/properties/:propertyId/statements/:statementId/pdf
   * Descargar PDF del estado de cuenta desde el portal de propiedades
   */
  @Get(':propertyId/statements/:statementId/pdf')
  @ApiOperation({
    summary: 'Descargar PDF de liquidación personal desde propiedades',
    description:
      'El propietario descarga el PDF de su liquidación desde el portal de propiedades',
  })
  @ApiParam({ name: 'slug', description: 'Identificador del tenant' })
  @ApiParam({
    name: 'propertyId',
    type: Number,
    description: 'ID de la propiedad',
  })
  @ApiParam({
    name: 'statementId',
    type: Number,
    description: 'ID del estado de cuenta',
  })
  @ApiQuery({
    name: 'lang',
    enum: ['es', 'en'],
    required: false,
    description: 'Idioma del PDF',
  })
  @ApiOkResponse({ description: 'Archivo PDF de liquidación' })
  @ApiForbiddenResponse({
    description: 'Liquidación no pertenece al propietario',
  })
  async downloadStatementPdfFromProperty(
    @Param('slug') _slug: string,
    @Param('propertyId', ParseIntPipe) _propertyId: number,
    @Param('statementId', ParseIntPipe) statementId: number,
    @Query('lang') lang?: 'es' | 'en',
    @Res() res?: Response,
  ) {
    const language = lang === 'en' ? 'en' : 'es';

    try {
      const filePath = await this.ownerStatementsService.generatePdf(
        statementId,
        language,
      );

      if (!res) {
        throw new BadRequestException('Response object unavailable');
      }

      res.download(filePath, `liquidacion_${statementId}.pdf`, (err) => {
        if (err) {
          this.logger.warn(
            `Error al descargar archivo de liquidación ${statementId}: ${err.message}`,
          );
        }
      });
    } catch (error) {
      throw new BadRequestException(
        `Error generando PDF: ${error instanceof Error ? error.message : 'Error desconocido'}`,
      );
    }
  }
}
