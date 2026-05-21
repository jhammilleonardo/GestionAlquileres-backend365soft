import {
  IsNotEmpty,
  IsNumber,
  IsEnum,
  IsOptional,
  IsString,
  IsBoolean,
  IsDateString,
  Min,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PaymentType,
  PaymentMethod,
  Currency,
  PaymentProcessor,
} from '../enums';

/**
 * Create Payment DTO
 *
 * DTO para crear un nuevo pago (usado por inquilinos).
 */
export class CreatePaymentDto {
  @ApiProperty({ example: 1250.5, minimum: 0.01 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @ApiPropertyOptional({ enum: Currency, example: Currency.BOB })
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency = Currency.USD;

  @ApiProperty({ enum: PaymentType, example: PaymentType.RENT })
  @IsEnum(PaymentType)
  @IsNotEmpty()
  payment_type: PaymentType;

  @ApiProperty({ enum: PaymentMethod, example: PaymentMethod.TRANSFER })
  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  payment_method: PaymentMethod;

  @ApiProperty({ example: '2026-05-20' })
  @IsDateString()
  @IsNotEmpty()
  payment_date: string;

  @ApiPropertyOptional({ example: '2026-05-25' })
  @IsDateString()
  @IsOptional()
  due_date?: string;

  @ApiPropertyOptional({ example: 'TRX-123456', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference_number?: string;

  @ApiPropertyOptional({ example: '000123', maxLength: 50 })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  check_number?: string;

  @ApiPropertyOptional({ example: 'Pago alquiler mayo 2026', maxLength: 500 })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({
    enum: PaymentProcessor,
    example: PaymentProcessor.MANUAL,
  })
  @IsEnum(PaymentProcessor)
  @IsOptional()
  payment_processor?: PaymentProcessor = PaymentProcessor.MANUAL;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  is_partial_payment?: boolean = false;

  @ApiPropertyOptional({ example: 31 })
  @IsNumber()
  @IsOptional()
  parent_payment_id?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean = false;

  @ApiPropertyOptional({ example: 2 })
  @IsNumber()
  @IsOptional()
  recurring_schedule_id?: number;
}
