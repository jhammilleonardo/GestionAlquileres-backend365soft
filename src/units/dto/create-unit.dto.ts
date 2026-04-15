import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsPositive,
  IsNumber,
  Min,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { UnitStatus } from '../enums/unit-status.enum';
import { RentalType } from '../enums/rental-type.enum';

export class CreateUnitDto {
  @ApiProperty({ example: '2A', description: 'Número o código de la unidad' })
  @IsString()
  @IsNotEmpty()
  unit_number: string;

  @ApiPropertyOptional({ example: 2, description: 'Piso de la unidad' })
  @IsOptional()
  @IsInt()
  @Min(0)
  floor?: number;

  @ApiPropertyOptional({ example: 2, description: 'Número de habitaciones' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bedrooms?: number;

  @ApiPropertyOptional({ example: 1, description: 'Número de baños' })
  @IsOptional()
  @IsInt()
  @Min(0)
  bathrooms?: number;

  @ApiPropertyOptional({ example: 65.5, description: 'Metros cuadrados' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  square_meters?: number;

  @ApiPropertyOptional({ enum: UnitStatus, default: UnitStatus.AVAILABLE })
  @IsOptional()
  @IsEnum(UnitStatus)
  status?: UnitStatus;

  @ApiPropertyOptional({ enum: RentalType })
  @IsOptional()
  @IsEnum(RentalType)
  rental_type?: RentalType;

  @ApiPropertyOptional({ example: 500, description: 'Precio mensual de alquiler' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price_per_month?: number;

  @ApiPropertyOptional({ example: 80, description: 'Precio por noche (alquiler corto plazo)' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price_per_night?: number;

  @ApiPropertyOptional({ example: 1000, description: 'Monto del depósito de garantía' })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  deposit_amount?: number;

  @ApiPropertyOptional({
    example: { has_balcony: true, has_parking: false, view: 'city' },
    description: 'Amenidades/características propias de la unidad',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}
