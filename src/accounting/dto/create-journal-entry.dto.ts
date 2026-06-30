import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  IsNumber,
  ValidateNested,
} from 'class-validator';

/** Una línea de un asiento manual: debe O haber sobre una cuenta del plan. */
export class JournalEntryLineDto {
  @ApiProperty({ example: '1100', description: 'Código de la cuenta del plan' })
  @IsString()
  @MaxLength(20)
  accountCode: string;

  @ApiProperty({
    example: 100.5,
    required: false,
    description: 'Monto al debe',
  })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  debit?: number;

  @ApiProperty({ example: 0, required: false, description: 'Monto al haber' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Type(() => Number)
  credit?: number;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  @MaxLength(255)
  memo?: string;
}

/** Asiento contable manual (General Journal Entry) para ajustes/reclasificaciones. */
export class CreateJournalEntryDto {
  @ApiProperty({ example: '2026-06-27' })
  @IsISO8601()
  entryDate: string;

  @ApiProperty({ example: 'Ajuste por reclasificación de gasto' })
  @IsString()
  @MaxLength(255)
  description: string;

  @ApiProperty({
    enum: ['cash', 'accrual'],
    required: false,
    default: 'accrual',
  })
  @IsOptional()
  @IsIn(['cash', 'accrual'])
  basis?: 'cash' | 'accrual';

  @ApiProperty({ type: [JournalEntryLineDto] })
  @IsArray()
  @ArrayMinSize(2)
  @ValidateNested({ each: true })
  @Type(() => JournalEntryLineDto)
  lines: JournalEntryLineDto[];
}
