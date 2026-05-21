import {
  IsNumber,
  IsString,
  IsOptional,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ApproveApplicationDto {
  // Feedback opcional para el inquilino
  @ApiPropertyOptional({ example: 'Solicitud aprobada tras verificación.' })
  @IsOptional()
  @IsString()
  admin_feedback?: string;

  // === DATOS DEL CONTRATO ===

  @ApiProperty({ example: 3000, minimum: 0 })
  @IsNumber()
  @Min(0)
  monthly_rent: number;

  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number; // Si no se envía, se calculará como 1 mes de renta

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string; // Default: BOB

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 31 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  payment_day?: number; // Default: 5

  @ApiPropertyOptional({ example: 'TRANSFER' })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  late_fee_percentage?: number; // Default: 0

  @ApiPropertyOptional({ example: 5, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_days?: number; // Default: 0

  @ApiPropertyOptional({ type: String, isArray: true, example: ['agua'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included_services?: string[];

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  start_date?: string; // Formato: YYYY-MM-DD. Default: hoy

  @ApiPropertyOptional({ example: '2027-05-31' })
  @IsOptional()
  @IsString()
  end_date?: string; // Formato: YYYY-MM-DD. Default: hoy + 1 año

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsString()
  key_delivery_date?: string; // Formato: YYYY-MM-DD

  @ApiPropertyOptional({ example: 'Pagar servicios no incluidos.' })
  @IsOptional()
  @IsString()
  tenant_responsibilities?: string;

  @ApiPropertyOptional({ example: 'Mantener estructura y seguros.' })
  @IsOptional()
  @IsString()
  owner_responsibilities?: string;

  @ApiPropertyOptional({ example: 'No subarrendar sin autorización.' })
  @IsOptional()
  @IsString()
  prohibitions?: string;

  @ApiPropertyOptional({ example: 'Respetar reglamento del edificio.' })
  @IsOptional()
  @IsString()
  coexistence_rules?: string;

  @ApiPropertyOptional({ example: 'Renovable por acuerdo escrito.' })
  @IsOptional()
  @IsString()
  renewal_terms?: string;

  @ApiPropertyOptional({ example: 'Preaviso de 30 días.' })
  @IsOptional()
  @IsString()
  termination_terms?: string;

  @ApiPropertyOptional({ example: 'Bolivia' })
  @IsOptional()
  @IsString()
  jurisdiction?: string; // Default: Bolivia

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean; // Default: false

  @ApiPropertyOptional({ example: 30, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  renewal_notice_days?: number; // Default: 30

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  auto_increase_percentage?: number; // Default: 0

  // Datos bancarios opcionales
  @ApiPropertyOptional({ example: '1000001234' })
  @IsOptional()
  @IsString()
  bank_account_number?: string;

  @ApiPropertyOptional({ example: 'CAJA_AHORRO' })
  @IsOptional()
  @IsString()
  bank_account_type?: string;

  @ApiPropertyOptional({ example: 'Banco Nacional' })
  @IsOptional()
  @IsString()
  bank_name?: string;

  @ApiPropertyOptional({ example: 'Empresa Demo SRL' })
  @IsOptional()
  @IsString()
  bank_account_holder?: string;
}
