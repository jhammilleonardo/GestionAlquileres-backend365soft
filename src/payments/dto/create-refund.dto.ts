import {
  IsNotEmpty,
  IsNumber,
  IsString,
  IsOptional,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * Create Refund DTO
 *
 * DTO para crear un reembolso de un pago.
 */
export class CreateRefundDto {
  @ApiProperty({ example: 300, minimum: 0.01 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto del reembolso debe ser mayor a 0' })
  amount: number;

  @ApiProperty({ example: 'Pago duplicado', maxLength: 1000 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @ApiPropertyOptional({ example: 'TRANSFER', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  refund_method?: string;

  @ApiPropertyOptional({ example: '2026-05-20' })
  @IsDateString()
  @IsOptional()
  refund_date?: string;

  @ApiPropertyOptional({ example: 'REF-123456', maxLength: 255 })
  @IsString()
  @IsOptional()
  @MaxLength(255)
  transaction_id?: string;
}
