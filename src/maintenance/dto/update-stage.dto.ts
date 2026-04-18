import { IsEnum, IsOptional, IsString } from 'class-validator';
import { MaintenanceStage } from '../enums/maintenance-stage.enum';

export class UpdateStageDto {
  @IsEnum(MaintenanceStage)
  to_stage: MaintenanceStage;

  @IsOptional()
  @IsString()
  notes?: string;
}
