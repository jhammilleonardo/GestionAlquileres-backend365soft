import {
  IsNumber,
  IsString,
  IsOptional,
  IsEnum,
  IsBoolean,
  IsArray,
  Min,
  Max,
} from 'class-validator';

export class ApproveApplicationDto {
  // Feedback opcional para el inquilino
  @IsOptional()
  @IsString()
  admin_feedback?: string;

  // === DATOS DEL CONTRATO ===

  @IsNumber()
  @Min(0)
  monthly_rent: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number; // Si no se envía, se calculará como 1 mes de renta

  @IsOptional()
  @IsString()
  currency?: string; // Default: BOB

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  payment_day?: number; // Default: 5

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  late_fee_percentage?: number; // Default: 0

  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_days?: number; // Default: 0

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included_services?: string[];

  @IsOptional()
  @IsString()
  start_date?: string; // Formato: YYYY-MM-DD. Default: hoy

  @IsOptional()
  @IsString()
  end_date?: string; // Formato: YYYY-MM-DD. Default: hoy + 1 año

  @IsOptional()
  @IsString()
  key_delivery_date?: string; // Formato: YYYY-MM-DD

  @IsOptional()
  @IsString()
  tenant_responsibilities?: string;

  @IsOptional()
  @IsString()
  owner_responsibilities?: string;

  @IsOptional()
  @IsString()
  prohibitions?: string;

  @IsOptional()
  @IsString()
  coexistence_rules?: string;

  @IsOptional()
  @IsString()
  renewal_terms?: string;

  @IsOptional()
  @IsString()
  termination_terms?: string;

  @IsOptional()
  @IsString()
  jurisdiction?: string; // Default: Bolivia

  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean; // Default: false

  @IsOptional()
  @IsNumber()
  @Min(0)
  renewal_notice_days?: number; // Default: 30

  @IsOptional()
  @IsNumber()
  @Min(0)
  auto_increase_percentage?: number; // Default: 0

  // Datos bancarios opcionales
  @IsOptional()
  @IsString()
  bank_account_number?: string;

  @IsOptional()
  @IsString()
  bank_account_type?: string;

  @IsOptional()
  @IsString()
  bank_name?: string;

  @IsOptional()
  @IsString()
  bank_account_holder?: string;
}
