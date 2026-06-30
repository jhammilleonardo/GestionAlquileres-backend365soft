import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ViolationStatusEnum } from '../enums/violation-status.enum';

export class UpdateViolationStatusDto {
  @IsEnum(ViolationStatusEnum)
  status: ViolationStatusEnum;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  resolved_notes?: string;

  /** Permite (re)definir el plazo de corrección al cambiar de etapa. */
  @IsDateString()
  @IsOptional()
  due_date?: string;
}
