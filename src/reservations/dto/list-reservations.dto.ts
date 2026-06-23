import {
  IsOptional,
  IsEnum,
  IsInt,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ReservationStatus } from '../enums/reservation-status.enum';

/**
 * Filtros del listado admin de reservas. Todos opcionales (auto-apply en el
 * frontend: al seleccionar un filtro se consulta, sin botón "Aplicar").
 */
export class ListReservationsDto {
  @ApiPropertyOptional({
    enum: ReservationStatus,
    description: 'Filtra por estado',
  })
  @IsOptional()
  @IsEnum(ReservationStatus)
  status?: ReservationStatus;

  @ApiPropertyOptional({ type: Number, description: 'Filtra por propiedad' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  property_id?: number;

  @ApiPropertyOptional({ type: Number, description: 'Filtra por unidad' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  unit_id?: number;

  @ApiPropertyOptional({
    example: '2026-05-01',
    description: 'Check-in desde (inclusive, YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  checkin_from?: string;

  @ApiPropertyOptional({
    example: '2026-05-31',
    description: 'Check-in hasta (inclusive, YYYY-MM-DD)',
  })
  @IsOptional()
  @IsDateString()
  checkin_to?: string;

  @ApiPropertyOptional({ type: Number, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  // Acotado a 100 para evitar respuestas gigantes (lección del módulo violations).
  @ApiPropertyOptional({ type: Number, default: 20, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
