import {
  IsDateString,
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateExpensePaymentDto {
  @ApiProperty({ example: 150.5, minimum: 0.01 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Type(() => Number)
  amount: number;

  @ApiPropertyOptional({ example: 'BOB', default: 'BOB' })
  @IsString()
  @Length(3, 3)
  @IsOptional()
  currency?: string = 'BOB';

  @ApiProperty({ example: '2026-06-26' })
  @IsDateString()
  payment_date: string;

  @ApiPropertyOptional({ example: 'TRANSFER' })
  @IsString()
  @IsOptional()
  payment_method?: string;

  @ApiPropertyOptional({ example: 'TRX-123456' })
  @IsString()
  @IsOptional()
  reference_number?: string;

  @ApiPropertyOptional({ example: 'Pago parcial de factura' })
  @IsString()
  @IsOptional()
  notes?: string;
}
