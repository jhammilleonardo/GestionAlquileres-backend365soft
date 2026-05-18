import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsDateString,
  IsEnum,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';

export enum ReportFormat {
  EXCEL = 'excel',
  PDF = 'pdf',
  JSON = 'json',
}

export class ReportFilterDto {
  @ApiPropertyOptional({ description: 'ID de la propiedad', type: Number })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @IsPositive()
  property_id?: number;

  @ApiPropertyOptional({ description: 'Fecha de inicio (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Estado para filtrar' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({
    enum: ReportFormat,
    description: 'Formato de exportación',
  })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}
