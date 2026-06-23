import { IsDateString } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** Rango de fechas para las métricas de reservas. */
export class AnalyticsQueryDto {
  @ApiProperty({ example: '2026-06-01' })
  @IsDateString()
  from: string;

  @ApiProperty({ example: '2026-06-30' })
  @IsDateString()
  to: string;
}
