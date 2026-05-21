import { ApiProperty, ApiPropertyOptional, OmitType } from '@nestjs/swagger';
import {
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';

/**
 * DTO para generar un QR dinámico de pago (MC4/SIP Bolivia)
 */
export class GenerateQrDto {
  @ApiProperty({ example: 1250.5, minimum: 0.01 })
  @IsNumber()
  @IsNotEmpty()
  @Min(0.01, { message: 'El monto debe ser mayor a 0' })
  amount: number;

  @ApiPropertyOptional({ example: 'BOB', default: 'BOB' })
  @IsString()
  @IsOptional()
  currency?: string;

  @ApiPropertyOptional({ example: 'RENT' })
  @IsString()
  @IsOptional()
  payment_type?: string;

  @ApiPropertyOptional({ example: 'Pago alquiler mayo 2026' })
  @IsString()
  @IsOptional()
  notes?: string;

  /** ID del inquilino — lo pone el controller desde el JWT */
  @ApiProperty({
    example: 7,
    description: 'ID del inquilino. Requerido solo en rutas admin.',
  })
  @IsNumber()
  @IsNotEmpty()
  tenant_id: number;

  @ApiPropertyOptional({ example: 22 })
  @IsNumber()
  @IsOptional()
  contract_id?: number;
}

export class GenerateTenantQrDto extends OmitType(GenerateQrDto, [
  'tenant_id',
] as const) {}
