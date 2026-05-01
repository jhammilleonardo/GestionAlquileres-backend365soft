import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsInt,
  IsPositive,
  IsNumber,
  Min,
  Max,
  IsObject,
  Matches,
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

  @ApiPropertyOptional({
    example: 500,
    description: 'Precio mensual de alquiler',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price_per_month?: number;

  @ApiPropertyOptional({
    example: 80,
    description: 'Precio por noche (alquiler corto plazo)',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  price_per_night?: number;

  @ApiPropertyOptional({
    example: 1000,
    description: 'Monto del depósito de garantía',
  })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  deposit_amount?: number;

  // ─── Campos exclusivos de alquiler corto plazo ────────────────────────────

  @ApiPropertyOptional({
    example: 2,
    description: 'Noches mínimas por reserva',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  min_nights?: number;

  @ApiPropertyOptional({
    example: 30,
    description: 'Noches máximas por reserva',
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(365)
  max_nights?: number;

  @ApiPropertyOptional({
    example: '14:00',
    description: 'Hora de check-in (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'checkin_time debe tener formato HH:MM',
  })
  checkin_time?: string;

  @ApiPropertyOptional({
    example: '11:00',
    description: 'Hora de check-out (HH:MM)',
  })
  @IsOptional()
  @IsString()
  @Matches(/^\d{2}:\d{2}$/, {
    message: 'checkout_time debe tener formato HH:MM',
  })
  checkout_time?: string;

  @ApiPropertyOptional({
    example: 30,
    description: 'Tarifa de limpieza por estadía',
  })
  @IsOptional()
  @IsNumber()
  @Min(0)
  cleaning_fee?: number;

  @ApiPropertyOptional({
    example: { has_balcony: true, has_parking: false, view: 'city' },
    description: 'Amenidades/características propias de la unidad',
  })
  @IsOptional()
  @IsObject()
  features?: Record<string, unknown>;
}
