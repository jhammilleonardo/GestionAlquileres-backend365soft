import {
  IsOptional,
  IsEnum,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { PaymentStatus, PaymentType, PaymentMethod, Currency } from '../enums';

/**
 * Campos permitidos para ordenamiento (previene SQL injection)
 */
export enum PaymentSortField {
  CREATED_AT = 'created_at',
  UPDATED_AT = 'updated_at',
  PAYMENT_DATE = 'payment_date',
  AMOUNT = 'amount',
  STATUS = 'status',
  TENANT_ID = 'tenant_id',
  PROPERTY_ID = 'property_id',
}

/**
 * Payment Filters DTO
 *
 * DTO para filtrar pagos (usado por admin).
 */
export class PaymentFiltersDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @ApiPropertyOptional({ enum: PaymentType })
  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @ApiPropertyOptional({ enum: PaymentMethod })
  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @ApiPropertyOptional({ enum: Currency })
  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @ApiPropertyOptional({ example: '2026-05-01' })
  @IsDateString()
  @IsOptional()
  date_from?: string;

  @ApiPropertyOptional({ example: '2026-05-31' })
  @IsDateString()
  @IsOptional()
  date_to?: string;

  @ApiPropertyOptional({ example: 7, type: Number })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  tenant_id?: number;

  @ApiPropertyOptional({ example: 12, type: Number })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  property_id?: number;

  @ApiPropertyOptional({ example: 22, type: Number })
  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  contract_id?: number;

  @ApiPropertyOptional({ example: 1, default: 1, minimum: 1 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @ApiPropertyOptional({ example: 50, default: 50, minimum: 1 })
  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  limit?: number = 50;

  @ApiPropertyOptional({
    enum: PaymentSortField,
    default: PaymentSortField.CREATED_AT,
  })
  @IsEnum(PaymentSortField)
  @IsOptional()
  sort?: PaymentSortField = PaymentSortField.CREATED_AT;

  @ApiPropertyOptional({ enum: ['ASC', 'DESC'], default: 'DESC' })
  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  order?: 'ASC' | 'DESC' = 'DESC';
}
