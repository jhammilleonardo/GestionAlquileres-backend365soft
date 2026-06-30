import { IsBooleanString, IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ViolationTypeEnum } from '../enums/violation-type.enum';
import { ViolationStatusEnum } from '../enums/violation-status.enum';
import { ViolationSeverityEnum } from '../enums/violation-severity.enum';

export class ViolationFiltersDto {
  @IsInt()
  @IsOptional()
  @Type(() => Number)
  property_id?: number;

  @IsEnum(ViolationStatusEnum)
  @IsOptional()
  status?: ViolationStatusEnum;

  @IsEnum(ViolationTypeEnum)
  @IsOptional()
  type?: ViolationTypeEnum;

  @IsEnum(ViolationSeverityEnum)
  @IsOptional()
  severity?: ViolationSeverityEnum;

  /** 'true' filtra solo infracciones abiertas y vencidas (due_date < hoy). */
  @IsBooleanString()
  @IsOptional()
  overdue?: string;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  tenant_id?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number;

  @IsInt()
  @IsOptional()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number;
}
