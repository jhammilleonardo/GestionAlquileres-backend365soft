import {
  IsOptional,
  IsDateString,
  IsNumber,
  IsString,
  IsBoolean,
  IsArray,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class RenewContractDto {
  @ApiPropertyOptional({ example: '2027-06-01' })
  @IsOptional()
  @IsDateString()
  start_date?: string;

  @ApiPropertyOptional({ example: 12, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  duration_months?: number;

  @ApiPropertyOptional({ example: 3300, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @ApiPropertyOptional({ example: 3300, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @ApiPropertyOptional({ example: 5, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  payment_day?: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'TRANSFER' })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({ example: 2, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  late_fee_percentage?: number;

  @ApiPropertyOptional({ example: 5, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_days?: number;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean;

  @ApiPropertyOptional({ example: 0, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  auto_increase_percentage?: number;

  @ApiPropertyOptional({ example: 30, minimum: 1 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  renewal_notice_days?: number;

  @ApiPropertyOptional({ type: String, isArray: true, example: ['agua'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included_services?: string[];

  @ApiPropertyOptional({ example: 'No subarrendar sin autorización.' })
  @IsOptional()
  @IsString()
  prohibitions?: string;

  @ApiPropertyOptional({ example: 'Pagar servicios no incluidos.' })
  @IsOptional()
  @IsString()
  tenant_responsibilities?: string;

  @ApiPropertyOptional({ example: 'Mantener estructura y seguros.' })
  @IsOptional()
  @IsString()
  owner_responsibilities?: string;

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
  jurisdiction?: string;
}
