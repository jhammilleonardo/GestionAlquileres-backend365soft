import {
  IsArray,
  IsBoolean,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { InspectionArea, ItemCondition } from './create-inspection.dto';

export class UpsertInspectionItemDto {
  @ApiPropertyOptional({ description: 'ID del ítem existente para actualizar; omitir para crear nuevo' })
  @IsOptional()
  @IsInt()
  id?: number;

  @ApiProperty({ enum: InspectionArea })
  @IsEnum(InspectionArea)
  area: InspectionArea;

  @ApiProperty({ example: 'Paredes' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  item_name: string;

  @ApiProperty({ enum: ItemCondition })
  @IsEnum(ItemCondition)
  condition: ItemCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class UpdateInspectionItemsDto {
  @ApiProperty({ type: [UpsertInspectionItemDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertInspectionItemDto)
  items: UpsertInspectionItemDto[];

  @ApiPropertyOptional({ description: 'Marcar la inspección como completada' })
  @IsOptional()
  @IsBoolean()
  complete?: boolean;
}
