import { IsNotEmpty, IsNumber, IsString, IsOptional, IsDateString, Min, MaxLength } from 'class-validator';

/**
 * Create Refund DTO
 *
 * DTO para crear un reembolso de un pago.
 */
export class CreateRefundDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto del reembolso debe ser mayor a 0' })
  amount: number;

  @IsString()
  @IsNotEmpty()
  @MaxLength(1000)
  reason: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  refund_method?: string;

  @IsDateString()
  @IsOptional()
  refund_date?: string;

  @IsString()
  @IsOptional()
  @MaxLength(255)
  transaction_id?: string;
}
