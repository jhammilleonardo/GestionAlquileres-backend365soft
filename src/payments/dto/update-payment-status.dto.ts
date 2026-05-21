import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus } from '../enums';

/**
 * Update Payment Status DTO
 *
 * DTO para que el admin actualice el estado de un pago.
 */
export class UpdatePaymentStatusDto {
  @ApiProperty({ enum: PaymentStatus, example: PaymentStatus.PROCESSING })
  @IsEnum(PaymentStatus)
  status: PaymentStatus;

  @ApiPropertyOptional({ example: 'Cambio manual por conciliación bancaria' })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;

  @ApiPropertyOptional({ example: 'Comprobante no corresponde al pago' })
  @IsString()
  @IsOptional()
  @MaxLength(500)
  rejection_reason?: string;
}
