import {
  IsNotEmpty,
  IsNumber,
  IsInt,
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
  PaymentStatus,
} from '../enums';

/**
 * Create Payment As Admin DTO
 *
 * DTO para que el admin cree un pago manualmente.
 * A diferencia del CreatePaymentDto, este requiere especificar
 * tenant_id, contract_id y property_id explícitamente.
 */
export class CreatePaymentAsAdminDto {
  @ApiProperty({ example: 7 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  tenant_id: number;

  @ApiProperty({ example: 22 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  contract_id: number;

  @ApiProperty({ example: 12 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  property_id: number;

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

  @ApiPropertyOptional({ enum: PaymentStatus, example: PaymentStatus.PENDING })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus = PaymentStatus.PENDING;

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

  // Campos específicos por método de pago
  @ApiPropertyOptional({ example: '1234', maxLength: 4 })
  @IsString()
  @IsOptional()
  @MaxLength(4)
  card_last_4_digits?: string;

  @ApiPropertyOptional({ example: 'LUIS ROJAS', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  card_holder_name?: string;

  @ApiPropertyOptional({ example: '05/2028', maxLength: 7 })
  @IsString()
  @IsOptional()
  @MaxLength(7)
  card_expiry?: string; // MM/YYYY

  @ApiPropertyOptional({ example: 'Banco Nacional', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bank_name?: string;

  @ApiPropertyOptional({ example: '9876', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  bank_account_last_4?: string;

  @ApiPropertyOptional({ example: 'pagos@example.com', maxLength: 200 })
  @IsString()
  @IsOptional()
  @MaxLength(200)
  payee_email?: string;

  @ApiPropertyOptional({ example: 'Caja central', maxLength: 100 })
  @IsString()
  @IsOptional()
  @MaxLength(100)
  received_by?: string;

  @ApiPropertyOptional({ example: 'Pago registrado por administración' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  notes?: string;

  @ApiPropertyOptional({ example: 'Validado contra extracto bancario' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;

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
  @IsOptional()
  @IsInt()
  @Min(1)
  parent_payment_id?: number;

  @ApiPropertyOptional({ example: false })
  @IsBoolean()
  @IsOptional()
  is_recurring?: boolean = false;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsInt()
  @Min(1)
  recurring_schedule_id?: number;
}
