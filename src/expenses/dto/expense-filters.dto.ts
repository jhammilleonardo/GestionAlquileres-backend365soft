import {
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExpenseCategoryEnum } from '../enums/expense-category.enum';

export class ExpenseFiltersDto {
  @ApiPropertyOptional({
    description: 'Filtrar por propiedad',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  property_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por unidad',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  unit_id?: number;

  @ApiPropertyOptional({
    description: 'Filtrar por categoría',
    enum: ExpenseCategoryEnum,
  })
  @IsEnum(ExpenseCategoryEnum)
  @IsOptional()
  category?: ExpenseCategoryEnum;

  @ApiPropertyOptional({
    description: 'Filtrar solo gastos recurrentes',
    example: false,
  })
  @Type(() => Boolean)
  @IsOptional()
  is_recurring?: boolean;

  @ApiPropertyOptional({
    description: 'Fecha de inicio del período (ISO 8601)',
    example: '2024-01-01',
  })
  @IsDateString()
  @IsOptional()
  from?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin del período (ISO 8601)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  to?: string;

  @ApiPropertyOptional({
    description: 'Buscar en descripción',
    example: 'fontanería',
  })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiPropertyOptional({
    description: 'Página (para paginación)',
    example: 1,
    minimum: 1,
  })
  @Type(() => Number)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items por página',
    example: 20,
    minimum: 1,
    maximum: 100,
  })
  @Type(() => Number)
  @IsOptional()
  limit?: number = 20;
}
