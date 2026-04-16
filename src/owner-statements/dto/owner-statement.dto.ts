import {
  IsNumber,
  IsNotEmpty,
  IsOptional,
  IsPositive,
  IsString,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateOwnerStatementDto {
  @ApiProperty({ example: 5 })
  @IsNotEmpty()
  @IsNumber()
  rental_owner_id: number;

  @ApiProperty({ example: 10 })
  @IsNotEmpty()
  @IsNumber()
  property_id: number;

  @ApiProperty({ example: 4 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  period_month: number;

  @ApiProperty({ example: 2026 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  period_year: number;

  @ApiProperty({ example: 5000 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  gross_rent: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  maintenance_deduction?: number;

  @ApiProperty({ example: 750 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  management_commission: number;

  @ApiProperty({ example: 3750 })
  @IsNotEmpty()
  @IsNumber()
  @IsPositive()
  net_amount: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  payment_count?: number;
}

export class UpdateOwnerStatementDto {
  @ApiPropertyOptional({ example: 5000 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  gross_rent?: number;

  @ApiPropertyOptional({ example: 500 })
  @IsOptional()
  @IsNumber()
  maintenance_deduction?: number;

  @ApiPropertyOptional({ example: 750 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  management_commission?: number;

  @ApiPropertyOptional({ example: 3750 })
  @IsOptional()
  @IsNumber()
  @IsPositive()
  net_amount?: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 1 })
  @IsOptional()
  @IsNumber()
  payment_count?: number;
}

export class OwnerStatementResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 5 })
  rental_owner_id: number;

  @ApiProperty({ example: 10 })
  property_id: number;

  @ApiProperty({ example: 4 })
  period_month: number;

  @ApiProperty({ example: 2026 })
  period_year: number;

  @ApiProperty({ example: 5000 })
  gross_rent: number;

  @ApiProperty({ example: 500 })
  maintenance_deduction: number;

  @ApiProperty({ example: 750 })
  management_commission: number;

  @ApiProperty({ example: 3750 })
  net_amount: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 1 })
  payment_count: number;

  @ApiProperty()
  generated_at: Date;

  @ApiProperty()
  created_at: Date;

  @ApiProperty()
  updated_at: Date;
}
