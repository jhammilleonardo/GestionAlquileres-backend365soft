import { IsString, IsOptional, IsBoolean } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateEmployeeDto {
  @ApiPropertyOptional({ example: 'Juan Pérez Actualizado' })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiPropertyOptional({ example: '+591 71111111' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'Activar o desactivar al empleado' })
  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
