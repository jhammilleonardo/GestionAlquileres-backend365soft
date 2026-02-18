import { IsNotEmpty, IsNumber, IsEnum, IsOptional, IsString, IsBoolean, IsDateString, Min, MaxLength } from 'class-validator';
import { PaymentType, PaymentMethod, Currency, PaymentProcessor } from '../enums';

/**
 * Create Payment DTO
 *
 * DTO para crear un nuevo pago (usado por inquilinos).
 */
export class CreatePaymentDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency = Currency.USD;

  @IsEnum(PaymentType)
  @IsNotEmpty()
  payment_type: PaymentType;

  @IsEnum(PaymentMethod)
  @IsNotEmpty()
  payment_method: PaymentMethod;

  @IsDateString()
  @IsNotEmpty()
  payment_date: string;

  @IsDateString()
  @IsOptional()
  due_date?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  reference_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  check_number?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsEnum(PaymentProcessor)
  @IsOptional()
  payment_processor?: PaymentProcessor = PaymentProcessor.MANUAL;

  @IsBoolean()
  @IsOptional()
  is_partial_payment?: boolean = false;

  @IsNumber()
  @IsOptional()
  parent_payment_id?: number;

  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean = false;

  @IsNumber()
  @IsOptional()
  recurring_schedule_id?: number;
}
