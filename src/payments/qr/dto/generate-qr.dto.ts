import { IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * DTO para generar un QR dinámico de pago (MC4/SIP Bolivia)
 */
export class GenerateQrDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  payment_type?: string;

  @IsString()
  @IsOptional()
  notes?: string;

  /** ID del inquilino — lo pone el controller desde el JWT */
  @IsNumber()
  @IsNotEmpty()
  tenant_id: number;

  @IsNumber()
  @IsOptional()
  contract_id?: number;
}
