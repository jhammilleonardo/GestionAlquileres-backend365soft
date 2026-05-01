import {
  IsArray,
  IsDateString,
  ArrayNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BlockDatesDto {
  @ApiProperty({
    example: ['2026-05-20', '2026-05-21', '2026-05-22'],
    description: 'Fechas a bloquear (formato YYYY-MM-DD)',
    type: [String],
  })
  @IsArray()
  @ArrayNotEmpty()
  @IsDateString({}, { each: true })
  dates: string[];

  @ApiPropertyOptional({
    example: 'Mantenimiento programado',
    description: 'Motivo del bloqueo',
  })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  reason?: string;
}
