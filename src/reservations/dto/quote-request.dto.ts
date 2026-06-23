import { IsDateString, IsInt, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Solicitud de cotización de una reserva de corto plazo. Devuelve el desglose
 * de precio ANTES de reservar (no crea nada, no requiere autenticación).
 */
export class QuoteRequestDto {
  @ApiProperty({
    example: '2026-06-10',
    description: 'Fecha de ingreso (YYYY-MM-DD)',
  })
  @IsDateString()
  checkin_date: string;

  @ApiProperty({
    example: '2026-06-15',
    description: 'Fecha de salida (YYYY-MM-DD)',
  })
  @IsDateString()
  checkout_date: string;

  @ApiPropertyOptional({ example: 2, description: 'Número de huéspedes' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  guests?: number;
}
