import { IsOptional, IsString, MaxLength } from 'class-validator';

/** DTO para que el admin apruebe un pago con comentario opcional. */
export class ApprovePaymentDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;
}
