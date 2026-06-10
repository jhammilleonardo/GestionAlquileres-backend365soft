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
  ApiBadRequestResponse,
  ApiBody,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request } from 'express';
import { PropertiesService } from './properties.service';
import { FilterCatalogPropertiesDto } from './dto/filter-catalog-properties.dto';
import {
  CreatePropertyContactDto,
  PropertyContactResponseDto,
} from './dto/create-property-contact.dto';
import {
  CatalogPropertyDetailResponseDto,
  PaginatedCatalogPropertiesResponseDto,
} from './dto/catalog-property-response.dto';

/**
 * Navegación pública del catálogo: solo lectura y de alto tráfico legítimo
 * (varios visitantes pueden compartir IP tras un NAT). El límite general de
 * 100/min es demasiado restrictivo aquí, así que se amplía a 600/min.
 */
const PUBLIC_CATALOG_THROTTLE = {
  default: { limit: 600, ttl: 60000 },
} as const;

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
  @Throttle(PUBLIC_CATALOG_THROTTLE)
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
  @ApiOkResponse({ type: PaginatedCatalogPropertiesResponseDto })
  @ApiBadRequestResponse({ description: 'Tenant slug inválido' })
  async findCatalogProperties(
    @Param('slug') slug: string,
    @Query() filters: FilterCatalogPropertiesDto,
  ) {
    try {
      return await this.propertiesService.findCatalogProperties(filters, slug);
    } catch (error) {
      if (error instanceof Error && error.message.includes('Tenant')) {
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
  @Throttle(PUBLIC_CATALOG_THROTTLE)
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
  @ApiOkResponse({ type: CatalogPropertyDetailResponseDto })
  @ApiBadRequestResponse({ description: 'Tenant slug inválido' })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async findCatalogPropertyDetail(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Req() req: Request,
  ) {
    try {
      return await this.propertiesService.findCatalogPropertyDetail(
        id,
        slug,
        getClientIp(req),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Tenant')) {
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
  @ApiBody({ type: CreatePropertyContactDto })
  @ApiOkResponse({ type: PropertyContactResponseDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o tenant slug inválido',
  })
  @ApiNotFoundResponse({ description: 'Propiedad no encontrada' })
  async createPropertyContact(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() contactDto: CreatePropertyContactDto,
    @Req() req: Request,
  ) {
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
        getClientIp(req),
      );
    } catch (error) {
      if (error instanceof Error && error.message.includes('Tenant')) {
        throw new BadRequestException('Invalid tenant slug');
      }
      throw error;
    }
  }
}

function getClientIp(req: Request): string | undefined {
  const forwardedFor = req.headers['x-forwarded-for'];
  if (typeof forwardedFor === 'string') {
    return forwardedFor.split(',')[0]?.trim();
  }

  if (Array.isArray(forwardedFor) && forwardedFor.length > 0) {
    return forwardedFor[0]?.split(',')[0]?.trim();
  }

  return req.ip || req.socket.remoteAddress;
}
