import {
  IsOptional,
  IsNumber,
  IsEnum,
  IsDateString,
  IsString,
  IsBoolean,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ExpensePaymentStatusEnum,
  ExpenseResponsibilityEnum,
  ExpenseScopeEnum,
} from '../enums/expense-category.enum';

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
    example: 'MAINTENANCE',
  })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({
    description: 'Filtrar por ámbito del gasto',
    enum: ExpenseScopeEnum,
  })
  @IsEnum(ExpenseScopeEnum)
  @IsOptional()
  expense_scope?: ExpenseScopeEnum;

  @ApiPropertyOptional({
    description: 'Filtrar por responsable económico',
    enum: ExpenseResponsibilityEnum,
  })
  @IsEnum(ExpenseResponsibilityEnum)
  @IsOptional()
  responsibility?: ExpenseResponsibilityEnum;

  @ApiPropertyOptional({
    description: 'Filtrar por estado de pago',
    enum: ExpensePaymentStatusEnum,
  })
  @IsEnum(ExpensePaymentStatusEnum)
  @IsOptional()
  payment_status?: ExpensePaymentStatusEnum;

  @ApiPropertyOptional({
    description: 'Filtrar solo gastos reembolsables',
    example: true,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @IsOptional()
  is_reimbursable?: boolean;

  @ApiPropertyOptional({
    description: 'Filtrar solo gastos recurrentes',
    example: false,
  })
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
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
