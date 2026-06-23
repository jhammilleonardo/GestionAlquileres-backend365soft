import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  Min,
} from 'class-validator';

export const ACCOUNT_TYPES = [
  'asset',
  'liability',
  'equity',
  'income',
  'expense',
] as const;
export type AccountType = (typeof ACCOUNT_TYPES)[number];

const JOURNAL_STATUSES = ['draft', 'posted', 'reversed'] as const;

/** Rango de fechas reutilizable (ISO `YYYY-MM-DD`). */
export class DateRangeQueryDto {
  @ApiPropertyOptional({
    example: '2026-01-01',
    description: 'Desde (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  from?: string;

  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Hasta (inclusive)',
  })
  @IsOptional()
  @IsDateString()
  to?: string;
}

export class ChartOfAccountsQueryDto {
  @ApiPropertyOptional({ enum: ACCOUNT_TYPES })
  @IsOptional()
  @IsIn(ACCOUNT_TYPES)
  type?: AccountType;

  @ApiPropertyOptional({ description: 'Filtra por estado activo' })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  isActive?: boolean;
}

export class JournalEntriesQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ enum: JOURNAL_STATUSES, default: 'posted' })
  @IsOptional()
  @IsIn(JOURNAL_STATUSES)
  status?: (typeof JOURNAL_STATUSES)[number];

  @ApiPropertyOptional({ example: 'payments' })
  @IsOptional()
  @IsString()
  sourceModule?: string;

  @ApiPropertyOptional({ default: 50, minimum: 1, maximum: 200 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(200)
  limit?: number;

  @ApiPropertyOptional({ default: 0, minimum: 0 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  offset?: number;
}

export class GeneralLedgerQueryDto extends DateRangeQueryDto {
  @ApiPropertyOptional({ example: '1100', description: 'Código de cuenta' })
  @IsString()
  accountCode!: string;
}

export class AsOfQueryDto {
  @ApiPropertyOptional({
    example: '2026-12-31',
    description: 'Fecha de corte (default: hoy)',
  })
  @IsOptional()
  @IsDateString()
  asOf?: string;
}
