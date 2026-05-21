import {
  IsOptional,
  IsNumber,
  IsString,
  IsEnum,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para filtrar propiedades en el catálogo público
 * Endpoint: GET /:slug/catalog/properties
 */
export class FilterCatalogPropertiesDto {
  /**
   * Filtro por tipo de propiedad (residential, commercial, etc)
   * Valores: 'residential' | 'commercial' | 'industrial'
   */
  @ApiPropertyOptional({ example: 'residential' })
  @IsOptional()
  @IsString()
  type?: string;

  /**
   * Precio mínimo en la moneda del tenant
   */
  @ApiPropertyOptional({ example: 1000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_price?: number;

  /**
   * Precio máximo en la moneda del tenant
   */
  @ApiPropertyOptional({ example: 5000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max_price?: number;

  /**
   * Cantidad mínima de dormitorios
   */
  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  bedrooms?: number;

  /**
   * Tipo de alquiler
   * Valores: 'short_term' | 'long_term' | 'any'
   */
  @ApiPropertyOptional({ example: 'long_term' })
  @IsOptional()
  @IsString()
  rental_type?: string;

  /**
   * Estado de la propiedad
   * Valores: 'DISPONIBLE' | 'OCUPADO' | 'MANTENIMIENTO' | 'RESERVADO'
   */
  @ApiPropertyOptional({
    enum: ['DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO'],
  })
  @IsOptional()
  @IsString()
  @IsEnum(['DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO'])
  status?: string;

  /**
   * Búsqueda de texto libre en título y descripción
   */
  @ApiPropertyOptional({ example: 'moderno vista' })
  @IsOptional()
  @IsString()
  search?: string;

  /**
   * Ciudad donde buscar
   */
  @ApiPropertyOptional({ example: 'La Paz' })
  @IsOptional()
  @IsString()
  city?: string;

  /**
   * País donde buscar
   */
  @ApiPropertyOptional({ example: 'Bolivia' })
  @IsOptional()
  @IsString()
  country?: string;

  /**
   * Ordenamiento de resultados
   * Valores: 'price_asc' | 'price_desc' | 'newest' | 'available'
   */
  @ApiPropertyOptional({
    enum: ['price_asc', 'price_desc', 'newest', 'available'],
  })
  @IsOptional()
  @IsString()
  @IsEnum(['price_asc', 'price_desc', 'newest', 'available'])
  sort?: string;

  /**
   * Número de página (comienza en 1)
   */
  @ApiPropertyOptional({ example: 1, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  /**
   * Límite de resultados por página (máximo 100)
   */
  @ApiPropertyOptional({ example: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 20;
}
