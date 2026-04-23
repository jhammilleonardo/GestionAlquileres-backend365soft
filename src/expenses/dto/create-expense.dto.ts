import {
  IsString,
  IsNumber,
  IsEnum,
  IsOptional,
  IsDateString,
  IsBoolean,
  IsUrl,
  Min,
  Length,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { ExpenseCategoryEnum } from '../enums/expense-category.enum';

export class CreateExpenseDto {
  @ApiProperty({
    description: 'ID de la propiedad',
    example: 1,
  })
  @IsNumber()
  @Type(() => Number)
  property_id: number;

  @ApiPropertyOptional({
    description: 'ID de la unidad (opcional)',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  unit_id?: number;

  @ApiProperty({
    description: 'Categoría del gasto (MAINTENANCE, INSURANCE, TAX, UTILITIES, MANAGEMENT_FEE, CLEANING, OTHER o personalizada)',
    example: 'MAINTENANCE',
  })
  @IsString()
  category: string;

  @ApiProperty({
    description: 'Monto del gasto',
    example: 150.50,
    minimum: 0.01,
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({
    description: 'Moneda (ISO 4217)',
    example: 'USD',
    default: 'USD',
  })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string = 'USD';

  @ApiPropertyOptional({
    description: 'Descripción del gasto',
    example: 'Reparación de tubería en la cocina',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    description: 'Fecha del gasto (ISO 8601)',
    example: '2024-04-15',
  })
  @IsDateString()
  date: string;

  @ApiPropertyOptional({
    description: 'ID del vendedor',
    example: 1,
  })
  @IsNumber()
  @IsOptional()
  @Type(() => Number)
  vendor_id?: number;

  @ApiPropertyOptional({
    description: 'Nombre del vendedor/proveedor',
    example: 'Fontanería García S.A.',
  })
  @IsString()
  @IsOptional()
  vendor_name?: string;

  @ApiPropertyOptional({
    description: 'URL del recibo/comprobante',
    example: 'https://storage.example.com/receipts/123.pdf',
  })
  @IsUrl()
  @IsOptional()
  receipt_url?: string;

  @ApiPropertyOptional({
    description: 'Es un gasto recurrente',
    example: false,
    default: false,
  })
  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean = false;

  @ApiPropertyOptional({
    description: 'Intervalo de recurrencia (DAILY, WEEKLY, MONTHLY, QUARTERLY, YEARLY)',
    example: 'MONTHLY',
    enum: ['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'],
  })
  @IsEnum(['DAILY', 'WEEKLY', 'MONTHLY', 'QUARTERLY', 'YEARLY'])
  @IsOptional()
  recurrence_interval?: string;

  @ApiPropertyOptional({
    description: 'Fecha de inicio de recurrencia (ISO 8601)',
    example: '2024-04-15',
  })
  @IsDateString()
  @IsOptional()
  recurrence_start_date?: string;

  @ApiPropertyOptional({
    description: 'Fecha de fin de recurrencia (ISO 8601)',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  recurrence_end_date?: string;

  @ApiPropertyOptional({
    description: 'Notas internas del gasto',
    example: 'Factura #1234 - Recibido 15/04/2024',
  })
  @IsString()
  @IsOptional()
  notes?: string;
}
