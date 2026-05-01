import {
  IsInt,
  IsPositive,
  IsDateString,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateReservationDto {
  @ApiProperty({ example: 3, description: 'ID de la propiedad' })
  @IsInt()
  @IsPositive()
  property_id: number;

  @ApiProperty({ example: 7, description: 'ID de la unidad' })
  @IsInt()
  @IsPositive()
  unit_id: number;

  @ApiProperty({
    example: '2026-05-10',
    description: 'Fecha de ingreso (YYYY-MM-DD)',
  })
  @IsDateString()
  checkin_date: string;

  @ApiProperty({
    example: '2026-05-15',
    description: 'Fecha de salida (YYYY-MM-DD)',
  })
  @IsDateString()
  checkout_date: string;

  @ApiPropertyOptional({
    example: 'Llegamos a las 15:00',
    description: 'Notas del huésped',
  })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
