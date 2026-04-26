import { IsEnum, IsOptional, IsString, IsBoolean } from 'class-validator';
import { Transform } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { VendorSpecialty } from '../enums/vendor-specialty.enum';

export class VendorFiltersDto {
  @ApiPropertyOptional({ enum: VendorSpecialty, description: 'Filtrar por especialidad' })
  @IsOptional()
  @IsEnum(VendorSpecialty)
  specialty?: VendorSpecialty;

  @ApiPropertyOptional({ description: 'Buscar por nombre (parcial, case-insensitive)' })
  @IsOptional()
  @IsString()
  search?: string;

  @ApiPropertyOptional({ default: true, description: 'Filtrar por estado activo/inactivo' })
  @IsOptional()
  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  is_active?: boolean;
}
