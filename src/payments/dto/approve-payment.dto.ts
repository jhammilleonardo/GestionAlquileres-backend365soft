import { IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

/** DTO para que el admin apruebe un pago con comentario opcional. */
export class ApprovePaymentDto {
  @ApiPropertyOptional({
    example: 'Comprobante validado contra extracto bancario',
    maxLength: 1000,
  })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  admin_notes?: string;
}
