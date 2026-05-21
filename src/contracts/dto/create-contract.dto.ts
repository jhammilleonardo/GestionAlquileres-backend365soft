import {
  IsNotEmpty,
  IsNumber,
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  Min,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ example: 12 })
  @IsNotEmpty()
  @IsNumber()
  tenant_id: number;

  @ApiProperty({ example: 8 })
  @IsNotEmpty()
  @IsNumber()
  property_id: number;

  @ApiProperty({ example: '2026-06-01' })
  @IsNotEmpty()
  @IsDateString()
  start_date: string;

  @ApiProperty({ example: '2027-05-31' })
  @IsNotEmpty()
  @IsDateString()
  end_date: string;

  @ApiPropertyOptional({ example: '2026-06-01' })
  @IsOptional()
  @IsDateString()
  key_delivery_date?: string;

  @ApiProperty({ example: 3000, minimum: 0 })
  @IsNotEmpty()
  @IsNumber()
  @Min(0)
  monthly_rent: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  payment_day?: number;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @IsNumber()
  deposit_amount?: number;

  @ApiPropertyOptional({ example: 'TRANSFER' })
  @IsOptional()
  @IsString()
  payment_method?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  late_fee_percentage?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  grace_days?: number;

  @ApiPropertyOptional({ type: String, isArray: true, example: ['agua'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  included_services?: string[];

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
  jurisdiction?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsNumber()
  renewal_notice_days?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  auto_increase_percentage?: number;

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

  @ApiPropertyOptional({ example: 33 })
  @IsOptional()
  @IsNumber()
  application_id?: number;
}
