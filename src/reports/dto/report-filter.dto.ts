import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID, IsEnum, IsDateString } from 'class-validator';

export enum ReportFormat {
  EXCEL = 'excel',
  PDF = 'pdf',
  JSON = 'json',
}

export class ReportFilterDto {
  @ApiPropertyOptional({ description: 'ID de la propiedad' })
  @IsOptional()
  @IsUUID()
  property_id?: string;

  @ApiPropertyOptional({ description: 'Fecha de inicio (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({ description: 'Fecha de fin (YYYY-MM-DD)' })
  @IsOptional()
  @IsDateString()
  to?: string;

  @ApiPropertyOptional({ description: 'Estado para filtrar (ej. ACTIVE, PENDING)' })
  @IsOptional()
  @IsString()
  status?: string;

  @ApiPropertyOptional({ enum: ReportFormat, description: 'Formato de exportación' })
  @IsOptional()
  @IsEnum(ReportFormat)
  format?: ReportFormat;
}