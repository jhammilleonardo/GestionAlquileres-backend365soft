import {
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  Min,
  Max,
  IsString,
} from 'class-validator';
import { Type, Transform } from 'class-transformer';

export class FilterPropertiesDto {
  @IsOptional()
  @IsEnum(['DISPONIBLE', 'OCUPADO', 'MANTENIMIENTO', 'RESERVADO', 'INACTIVO'])
  status?: string;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  property_type_id?: number;

  @IsOptional()
  @IsNumber()
  @Type(() => Number)
  property_subtype_id?: number;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  country?: string;

  @IsOptional()
  @IsString()
  search?: string;

  // Filtros de precio
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_rent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  max_rent?: number;

  // Filtros de caracteristicas
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_bedrooms?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Type(() => Number)
  min_bathrooms?: number;

  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_furnished?: boolean;

  // Ordenamiento
  @IsOptional()
  @IsEnum(['created_at', 'updated_at', 'title', 'monthly_rent'])
  sort_by?: string;

  @IsOptional()
  @IsEnum(['ASC', 'DESC'])
  sort_order?: 'ASC' | 'DESC';

  // Paginacion
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
