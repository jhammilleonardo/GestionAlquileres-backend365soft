import { IsIn, IsInt, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para actualizar una tarea de limpieza (estado/asignación/notas). */
export class UpdateHousekeepingDto {
  @ApiPropertyOptional({ enum: ['pending', 'in_progress', 'done'] })
  @IsOptional()
  @IsIn(['pending', 'in_progress', 'done'])
  status?: string;

  @ApiPropertyOptional({ example: 12 })
  @IsOptional()
  @IsInt()
  assigned_to?: number;

  @ApiPropertyOptional({ example: 'Revisar baño', maxLength: 500 })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}
