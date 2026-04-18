import {
  IsBoolean,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';
import { ScreeningFinalStatus } from '../enums/screening-final-status.enum';

export class UpdateScreeningDto {
  @IsOptional()
  @IsBoolean()
  documents_verified?: boolean;

  @IsOptional()
  @IsString()
  employer_call_name?: string;

  @IsOptional()
  @IsString()
  employer_call_phone?: string;

  @IsOptional()
  @IsString()
  employer_call_result?: string;

  @IsOptional()
  @IsString()
  previous_landlord_name?: string;

  @IsOptional()
  @IsString()
  previous_landlord_phone?: string;

  @IsOptional()
  @IsString()
  previous_landlord_result?: string;

  @IsOptional()
  @IsBoolean()
  blacklist_checked?: boolean;

  @IsOptional()
  @IsString()
  blacklist_result?: string;

  @IsOptional()
  @IsString()
  notes?: string;

  @IsOptional()
  @IsEnum(ScreeningFinalStatus)
  final_status?: ScreeningFinalStatus;

  // Datos del contrato — requeridos cuando final_status es APPROVED
  @IsOptional()
  @IsNumber()
  @Min(0)
  monthly_rent?: number;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(31)
  payment_day?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  deposit_amount?: number;

  @IsOptional()
  @IsString()
  admin_feedback?: string;
}
