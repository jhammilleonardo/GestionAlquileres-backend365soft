import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

/** DTO para que el admin rechace un pago con motivo obligatorio. */
export class RejectPaymentDto {
  @IsString()
  @IsNotEmpty({ message: 'El motivo de rechazo es obligatorio' })
  @MaxLength(500)
  rejection_reason: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;
}
