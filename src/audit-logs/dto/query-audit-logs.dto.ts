import {
  IsOptional,
  IsEnum,
  IsNumberString,
  IsDateString,
  IsString,
} from 'class-validator';
import { AuditAction } from '../enums/audit-action.enum';

export class QueryAuditLogsDto {
  @IsOptional()
  @IsNumberString()
  user_id?: string;

  @IsOptional()
  @IsString()
  entity_type?: string;

  @IsOptional()
  @IsNumberString()
  entity_id?: string;

  @IsOptional()
  @IsEnum(AuditAction)
  action?: AuditAction;

  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsNumberString()
  page?: string;

  @IsOptional()
  @IsNumberString()
  limit?: string;
}
