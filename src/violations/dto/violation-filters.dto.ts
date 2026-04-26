import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ViolationTypeEnum } from '../enums/violation-type.enum';
import { ViolationStatusEnum } from '../enums/violation-status.enum';

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
