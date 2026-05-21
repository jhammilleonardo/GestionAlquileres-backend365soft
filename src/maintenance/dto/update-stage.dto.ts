import { IsEnum, IsOptional, IsString } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { MaintenanceStage } from '../enums/maintenance-stage.enum';

export class UpdateStageDto {
  @ApiProperty({
    enum: MaintenanceStage,
    example: MaintenanceStage.IN_PROGRESS,
  })
  @IsEnum(MaintenanceStage)
  to_stage: MaintenanceStage;

  @ApiPropertyOptional({ example: 'Trabajo iniciado por técnico asignado' })
  @IsOptional()
  @IsString()
  notes?: string;
}
