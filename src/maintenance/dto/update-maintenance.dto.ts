import { IsEnum, IsOptional, IsNumber, IsDateString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateMaintenanceDto {
  @ApiPropertyOptional({
    description: 'Estado de la solicitud',
    enum: ['NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED'],
  })
  @IsEnum(['NEW', 'IN_PROGRESS', 'COMPLETED', 'DEFERRED', 'CLOSED'])
  @IsOptional()
  status?: 'NEW' | 'IN_PROGRESS' | 'COMPLETED' | 'DEFERRED' | 'CLOSED';

  @ApiPropertyOptional({
    description: 'Prioridad',
    enum: ['LOW', 'NORMAL', 'HIGH'],
  })
  @IsEnum(['LOW', 'NORMAL', 'HIGH'])
  @IsOptional()
  priority?: 'LOW' | 'NORMAL' | 'HIGH';

  @ApiPropertyOptional({
    description: 'Fecha de vencimiento',
    example: '2024-12-31',
  })
  @IsDateString()
  @IsOptional()
  due_date?: string;

  @ApiPropertyOptional({ description: 'ID del admin asignado', example: 1 })
  @IsNumber()
  @IsOptional()
  assigned_to?: number;
}
