import {
  IsInt,
  IsOptional,
  IsEnum,
  IsString,
  IsDateString,
  IsArray,
  IsNotEmpty,
  MaxLength,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum InspectionType {
  MOVE_IN = 'move_in',
  MOVE_OUT = 'move_out',
  PERIODIC = 'periodic',
}

export enum InspectionArea {
  LIVING_ROOM = 'living_room',
  KITCHEN = 'kitchen',
  BATHROOM = 'bathroom',
  BEDROOM = 'bedroom',
  EXTERIOR = 'exterior',
  OTHER = 'other',
}

export enum ItemCondition {
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor',
  DAMAGED = 'damaged',
}

export class CreateInspectionItemDto {
  @ApiProperty({ enum: InspectionArea })
  @IsEnum(InspectionArea)
  area: InspectionArea;

  @ApiProperty({ example: 'Paredes' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  item_name: string;

  @ApiPropertyOptional({ enum: ItemCondition, default: ItemCondition.GOOD })
  @IsOptional()
  @IsEnum(ItemCondition)
  condition?: ItemCondition;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class CreateInspectionDto {
  @ApiProperty({ example: 1 })
  @IsInt()
  property_id: number;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  unit_id?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  contract_id?: number;

  @ApiProperty({ enum: InspectionType })
  @IsEnum(InspectionType)
  type: InspectionType;

  @ApiProperty({ example: '2026-04-25' })
  @IsDateString()
  scheduled_date: string;

  @ApiPropertyOptional({ example: 3 })
  @IsOptional()
  @IsInt()
  inspector_user_id?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  notes?: string;

  @ApiPropertyOptional({ type: [CreateInspectionItemDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateInspectionItemDto)
  items?: CreateInspectionItemDto[];
}
