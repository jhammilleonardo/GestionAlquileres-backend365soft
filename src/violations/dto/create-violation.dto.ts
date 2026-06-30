import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  IsNumber,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ViolationTypeEnum } from '../enums/violation-type.enum';
import { ViolationSeverityEnum } from '../enums/violation-severity.enum';

export class CreateViolationDto {
  @IsInt()
  @Type(() => Number)
  property_id: number;

  @IsInt()
  @IsOptional()
  @Type(() => Number)
  unit_id?: number;

  @IsInt()
  @Type(() => Number)
  tenant_id: number;

  @IsEnum(ViolationTypeEnum)
  type: ViolationTypeEnum;

  @IsEnum(ViolationSeverityEnum)
  @IsOptional()
  severity?: ViolationSeverityEnum;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  /** Plazo de corrección (YYYY-MM-DD). */
  @IsDateString()
  @IsOptional()
  due_date?: string;

  /** Multa opcional aplicada al registrar (queda en estado 'charged'). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @IsOptional()
  @Type(() => Number)
  fine_amount?: number;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence_photos?: string[];
}
