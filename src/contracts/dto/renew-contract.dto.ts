import {
  IsOptional,
  IsDateString,
  IsNumber,
  IsString,
  IsBoolean,
  IsArray,
  Min,
} from 'class-validator';

export class RenewContractDto {
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  duration_months?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  payment_day?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  payment_method?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  late_fee_percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_days?: number;

  @IsOptional()
  @IsString()
  jurisdiction?: string;

  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean;

  @IsOptional()
  @IsNumber()
  @Min(0)
  auto_increase_percentage?: number;

  @IsOptional()
  @IsNumber()
  @Min(1)
  renewal_notice_days?: number;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included_services?: string[];

  @IsOptional()
  @IsString()
  prohibitions?: string;

  @IsOptional()
  @IsString()
  tenant_responsibilities?: string;

  @IsOptional()
  @IsString()
  owner_responsibilities?: string;

  @IsOptional()
  @IsString()
  coexistence_rules?: string;

  @IsOptional()
  @IsString()
  renewal_terms?: string;

  @IsOptional()
  @IsString()
  termination_terms?: string;
}
