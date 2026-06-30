import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionArea, InspectionType } from './create-inspection.dto';

export class TemplateItemDto {
  @ApiProperty({ enum: InspectionArea })
  @IsEnum(InspectionArea)
  area: InspectionArea;

  @ApiProperty({ example: 'Paredes' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  item_name: string;
}

export class CreateInspectionTemplateDto {
  @ApiProperty({ example: 'Checklist mudanza' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiPropertyOptional({
    enum: InspectionType,
    description: 'Tipo sugerido; null aplica a cualquier inspección.',
  })
  @IsOptional()
  @IsEnum(InspectionType)
  type?: InspectionType;

  @ApiProperty({ type: [TemplateItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items: TemplateItemDto[];
}

export class UpdateInspectionTemplateDto {
  @ApiPropertyOptional({ example: 'Checklist mudanza' })
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional({ enum: InspectionType })
  @IsOptional()
  @IsEnum(InspectionType)
  type?: InspectionType | null;

  @ApiPropertyOptional({ type: [TemplateItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => TemplateItemDto)
  items?: TemplateItemDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  is_default?: boolean;
}
