import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ScreeningFinalStatus } from '../enums/screening-final-status.enum';

export class UpdateScreeningDto {
  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  documents_verified?: boolean;

  @ApiPropertyOptional({ example: 'RRHH Empresa Demo' })
  @IsOptional()
  @IsString()
  employer_call_name?: string;

  @ApiPropertyOptional({ example: '+59170000000' })
  @IsOptional()
  @IsString()
  employer_call_phone?: string;

  @ApiPropertyOptional({ example: 'Ingresos y antigüedad verificados' })
  @IsOptional()
  @IsString()
  employer_call_result?: string;

  @ApiPropertyOptional({ example: 'Ana Perez' })
  @IsOptional()
  @IsString()
  previous_landlord_name?: string;

  @ApiPropertyOptional({ example: '+59171111111' })
  @IsOptional()
  @IsString()
  previous_landlord_phone?: string;

  @ApiPropertyOptional({ example: 'Buen historial de pago' })
  @IsOptional()
  @IsString()
  previous_landlord_result?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  blacklist_checked?: boolean;

  @ApiPropertyOptional({ example: 'Sin registros' })
  @IsOptional()
  @IsString()
  blacklist_result?: string;

  @ApiPropertyOptional({ example: 'Checklist completo.' })
  @IsOptional()
  @IsString()
  notes?: string;

  @ApiPropertyOptional({
    enum: ScreeningFinalStatus,
    example: ScreeningFinalStatus.APPROVED,
  })
  @IsOptional()
  @IsEnum(ScreeningFinalStatus)
  final_status?: ScreeningFinalStatus;

  // Datos del contrato — requeridos cuando final_status es APPROVED
  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 5, minimum: 1, maximum: 31 })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  payment_day?: number;

  @ApiPropertyOptional({ example: 3000, minimum: 0 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @ApiPropertyOptional({ example: 'Solicitud aprobada tras screening.' })
  @IsOptional()
  @IsString()
  admin_feedback?: string;
}
