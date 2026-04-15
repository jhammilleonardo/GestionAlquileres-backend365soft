import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsEmail,
  MaxLength,
  Matches,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class BankDetailsDto {
  @ApiPropertyOptional({ example: 'Banco Nacional de Bolivia' })
  @IsOptional()
  @IsString()
  @MaxLength(100)
  bank_name?: string;

  @ApiPropertyOptional({ example: '1234567890' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  account_number?: string;

  /**
   * Tipo de cuenta bancaria.
   * Valores aceptados: 'checking' | 'savings' | 'corriente' | 'ahorro'
   */
  @ApiPropertyOptional({
    example: 'savings',
    enum: ['checking', 'savings', 'corriente', 'ahorro'],
  })
  @IsOptional()
  @IsString()
  @Matches(/^(checking|savings|corriente|ahorro)$/, {
    message: 'account_type debe ser: checking, savings, corriente o ahorro',
  })
  account_type?: string;

  @ApiPropertyOptional({ example: 'Juan Pérez García' })
  @IsOptional()
  @IsString()
  @MaxLength(150)
  account_holder_name?: string;

  /**
   * CBU (22 dígitos, Bolivia/Argentina), IBAN (hasta 34 chars) o
   * routing number (EE.UU.). Se almacena sin formato.
   */
  @ApiPropertyOptional({
    example: '0000003100012345678901',
    description: 'CBU, IBAN o routing number según el país del tenant',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  cbu_iban?: string;
}

export class CreateRentalOwnerDto {
  // ─── Datos personales ─────────────────────────────────────────────────────

  @ApiProperty({ example: 'Carlos Mamani' })
  @IsString()
  @IsNotEmpty()
  name: string;

  @ApiPropertyOptional({ example: 'Inmobiliaria Mamani S.R.L.' })
  @IsOptional()
  @IsString()
  company_name?: string;

  @ApiPropertyOptional({ example: false })
  @IsOptional()
  @IsBoolean()
  is_company?: boolean;

  @ApiProperty({ example: 'carlos.mamani@email.com' })
  @IsEmail()
  @IsNotEmpty()
  primary_email: string;

  @ApiProperty({ example: '+591 70000000' })
  @IsString()
  @IsNotEmpty()
  phone_number: string;

  @ApiPropertyOptional({ example: 'otro@email.com' })
  @IsOptional()
  @IsEmail()
  secondary_email?: string;

  @ApiPropertyOptional({ example: '+591 70000001' })
  @IsOptional()
  @IsString()
  secondary_phone?: string;

  @ApiPropertyOptional({ example: 'Propietario confiable, pago puntual' })
  @IsOptional()
  @IsString()
  notes?: string;

  // ─── Datos bancarios (opcionales al crear) ────────────────────────────────

  @ApiPropertyOptional({ type: BankDetailsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => BankDetailsDto)
  bank_details?: BankDetailsDto;
}
