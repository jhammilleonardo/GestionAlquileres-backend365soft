import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para que el admin rechace un pago con motivo obligatorio. */
export class RejectPaymentDto {
  @ApiProperty({ example: 'Comprobante ilegible', maxLength: 500 })
  @IsString()
  @IsNotEmpty({ message: 'El motivo de rechazo es obligatorio' })
  @MaxLength(500)
  rejection_reason: string;

  @ApiPropertyOptional({
    example: 'Solicitar nuevo comprobante al inquilino',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;
}
