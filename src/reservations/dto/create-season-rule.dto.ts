import {
  IsDateString,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para crear una temporada (override de precio/noches en un rango). */
export class CreateSeasonRuleDto {
  @ApiProperty({ example: 'Temporada alta', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: '2026-12-15' })
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2027-01-15' })
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ example: 120.0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  price_per_night?: number;

  @ApiPropertyOptional({ example: 3, minimum: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  min_nights?: number;
}
