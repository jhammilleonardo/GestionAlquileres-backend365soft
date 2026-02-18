import { IsNotEmpty, IsNumber, IsEnum, IsOptional, IsString, IsBoolean, IsDateString, Min, MaxLength } from 'class-validator';
import { PaymentType, PaymentMethod, Currency, PaymentProcessor, PaymentStatus } from '../enums';

/**
 * Create Payment As Admin DTO
 *
 * DTO para que el admin cree un pago manualmente.
 * A diferencia del CreatePaymentDto, este requiere especificar
 * tenant_id, contract_id y property_id explícitamente.
 */
export class CreatePaymentAsAdminDto {
  @IsNumber()
  @IsNotEmpty()
  tenant_id: number;

  @IsNumber()
  @IsNotEmpty()
  contract_id: number;

  @IsNumber()
  @IsNotEmpty()
  property_id: number;

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

  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus = PaymentStatus.PENDING;

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

  // Campos específicos por método de pago
  @IsString()
  @IsOptional()
  @MaxLength(4)
  card_last_4_digits?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  card_holder_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(7)
  card_expiry?: string; // MM/YYYY

  @IsString()
  @IsOptional()
  @MaxLength(100)
  bank_name?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  bank_account_last_4?: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  payee_email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_by?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;

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
