import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { PropertiesService } from './properties.service';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import { CreatePropertyContactDto } from './dto/create-property-contact.dto';

/**
 * Controlador público del catálogo de propiedades
 * NO requiere autenticación
 * Endpoint: GET|POST /:slug/catalog/properties
 */
@ApiTags('Properties - Public Catalog')
@Controller(':slug/catalog')
export class PublicCatalogController {
  constructor(private readonly propertiesService: PropertiesService) {}

  /**
   * Listar propiedades disponibles con filtros, paginación y ordenamiento
   * GET /:slug/catalog/properties
   * 
   * Filtros soportados:
   * - type: property type code (residential, commercial, etc)
   * - min_price: precio mínimo
   * - max_price: precio máximo
   * - bedrooms: cantidad mínima de dormitorios
   * - city: ciudad (búsqueda parcial, case-insensitive)
   * - country: país
   * - search: búsqueda de texto libre en título y descripción
   * - sort: price_asc, price_desc, newest, available
   * - page: número de página (default: 1)
   * - limit: items por página (default: 20, máximo: 100)
   */
  @Get('properties')
  @ApiOperation({
    summary: 'Listar propiedades disponibles del catálogo público',
    description:
      'Obtiene un listado de propiedades disponibles con soporte para filtros, búsqueda, paginación y ordenamiento',
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug de la organización/tenant',
    example: 'mi-inmobiliaria',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    description: 'Filtro por tipo de propiedad (ej: residential, commercial)',
    example: 'residential',
  })
  @ApiQuery({
    name: 'min_price',
    required: false,
    description: 'Precio mínimo',
    example: 1000,
  })
  @ApiQuery({
    name: 'max_price',
    required: false,
    description: 'Precio máximo',
    example: 5000,
  })
  @ApiQuery({
    name: 'bedrooms',
    required: false,
    description: 'Cantidad mínima de dormitorios',
    example: 2,
  })
  @ApiQuery({
    name: 'city',
    required: false,
    description: 'Buscar por ciudad',
    example: 'La Paz',
  })
  @ApiQuery({
    name: 'country',
    required: false,
    description: 'Filtro por país',
    example: 'Bolivia',
  })
  @ApiQuery({
    name: 'search',
    required: false,
    description: 'Búsqueda de texto libre',
    example: 'moderno vista',
  })
  @ApiQuery({
    name: 'sort',
    required: false,
    description: 'Ordenamiento: price_asc, price_desc, newest, available',
    example: 'price_asc',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    description: 'Número de página',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    description: 'Items por página (máximo 100)',
    example: 20,
  })
  async findCatalogProperties(
    @Param('slug') slug: string,
    @Query() filters: FilterCatalogPropertiesDto,
    @Req() req: any,
  ) {
    const clientIP =
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection.remoteAddress;

    try {
      return await this.propertiesService.findCatalogProperties(filters, slug);
    } catch (error) {
      if (error.message.includes('Tenant')) {
        throw new BadRequestException('Invalid tenant slug');
      }
      throw error;
    }
  }

  /**
   * Obtener detalle completo de una propiedad
   * GET /:slug/catalog/properties/:id
   * 
   * - Retorna: Detalle completo con fotos, amenidades, reglas, servicios
   * - Efecto colateral: Incrementa el contador de vistas
   * - Registra: IP del cliente y timestamp de visualización
   */
  @Get('properties/:id')
  @ApiOperation({
    summary: 'Obtener detalle de propiedad específica del catálogo',
    description:
      'Retorna el detalle completo de una propiedad incluyendo fotos, amenidades, reglas y servicios. Incrementa automáticamente el contador de vistas.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug de la organización/tenant',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la propiedad',
    example: 1,
  })
  async findCatalogPropertyDetail(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: any,
  ) {
    const clientIP =
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection.remoteAddress;

    try {
      return await this.propertiesService.findCatalogPropertyDetail(
        id,
        slug,
        clientIP,
      );
    } catch (error) {
      if (error.message.includes('Tenant')) {
        throw new BadRequestException('Invalid tenant slug');
      }
      throw error;
    }
  }

  /**
   * Registrar un contacto/lead para una propiedad
   * POST /:slug/catalog/properties/:id/contact
   * 
   * - NO requiere autenticación
   * - Guarda: Información del interesado como Lead
   * - Notifica: Al administrador sobre el nuevo lead
   * - Asigna: El lead para seguimiento posterior
   */
  @Post('properties/:id/contact')
  @ApiOperation({
    summary: 'Registrar contacto/lead para una propiedad',
    description:
      'Crea un registro de contacto/lead de una persona interesada en la propiedad. Envía una notificación al administrador.',
  })
  @ApiParam({
    name: 'slug',
    description: 'Slug de la organización/tenant',
  })
  @ApiParam({
    name: 'id',
    description: 'ID de la propiedad',
    example: 1,
  })
  async createPropertyContact(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() contactDto: CreatePropertyContactDto,
    @Req() req: any,
  ) {
    const clientIP =
      req.ip ||
      req.headers['x-forwarded-for']?.split(',')[0] ||
      req.connection.remoteAddress;

    // Validaciones básicas
    if (!contactDto.name || !contactDto.email || !contactDto.message) {
      throw new BadRequestException(
        'name, email, and message are required fields',
      );
    }

    if (contactDto.message.length < 10) {
      throw new BadRequestException(
        'message must be at least 10 characters long',
      );
    }

    try {
      return await this.propertiesService.createPropertyContact(
        id,
        contactDto,
        slug,
        clientIP,
      );
    } catch (error) {
      if (error.message.includes('Tenant')) {
        throw new BadRequestException('Invalid tenant slug');
      }
      throw error;
    }
  }
}
