import {
  IsNotEmpty,
  IsNumber,
  IsInt,
  IsDateString,
  IsOptional,
  IsString,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateContractDto {
  @ApiProperty({ example: 12 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
  tenant_id: number;

  @ApiProperty({ example: 8 })
  @IsNotEmpty()
  @IsInt()
  @Min(1)
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
  @MaxLength(3)
  currency?: string;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  payment_day?: number;

  @ApiPropertyOptional({ example: 3000 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @ApiPropertyOptional({ example: 'TRANSFER' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  payment_method?: string;

  @ApiPropertyOptional({ example: 2 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  late_fee_percentage?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  grace_days?: number;

  @ApiPropertyOptional({ type: String, isArray: true, example: ['agua'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  included_services?: string[];

  @ApiPropertyOptional({ example: 'Pagar servicios no incluidos.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  tenant_responsibilities?: string;

  @ApiPropertyOptional({ example: 'Mantener estructura y seguros.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  owner_responsibilities?: string;

  @ApiPropertyOptional({ example: 'No subarrendar sin autorización.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  prohibitions?: string;

  @ApiPropertyOptional({ example: 'Respetar reglamento del edificio.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  coexistence_rules?: string;

  @ApiPropertyOptional({ example: 'Renovable por acuerdo escrito.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  renewal_terms?: string;

  @ApiPropertyOptional({ example: 'Preaviso de 30 días.' })
  @IsOptional()
  @IsString()
  @MaxLength(5000)
  termination_terms?: string;

  @ApiPropertyOptional({ example: 'Bolivia' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  jurisdiction?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  auto_renew?: boolean;

  @ApiPropertyOptional({ example: 30 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  renewal_notice_days?: number;

  @ApiPropertyOptional({ example: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  auto_increase_percentage?: number;

  @ApiPropertyOptional({ example: '1000001234' })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  bank_account_number?: string;

  @ApiPropertyOptional({ example: 'CAJA_AHORRO' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  bank_account_type?: string;

  @ApiPropertyOptional({ example: 'Banco Nacional' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank_name?: string;

  @ApiPropertyOptional({ example: 'Empresa Demo SRL' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  bank_account_holder?: string;

  @ApiPropertyOptional({ example: 33 })
  @IsOptional()
  @IsInt()
  @Min(1)
  application_id?: number;
}
