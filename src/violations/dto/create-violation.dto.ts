import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsArray,
  MaxLength,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ViolationTypeEnum } from '../enums/violation-type.enum';

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

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  description: string;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  evidence_photos?: string[];
}
