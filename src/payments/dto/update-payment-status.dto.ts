import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { PaymentStatus } from '../enums';

/**
 * Update Payment Status DTO
 *
 * DTO para que el admin actualice el estado de un pago.
 */
export class UpdatePaymentStatusDto {
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejection_reason?: string;
}
