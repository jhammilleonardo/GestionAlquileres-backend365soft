import { IsOptional, IsEnum, IsString, IsDateString, IsNumber, Min } from 'class-validator';
import { Type } from 'class-transformer';
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
  @IsEnum(PaymentStatus)
  @IsOptional()
  status?: PaymentStatus;

  @IsEnum(PaymentType)
  @IsOptional()
  type?: PaymentType;

  @IsEnum(PaymentMethod)
  @IsOptional()
  method?: PaymentMethod;

  @IsEnum(Currency)
  @IsOptional()
  currency?: Currency;

  @IsDateString()
  @IsOptional()
  date_from?: string;

  @IsDateString()
  @IsOptional()
  date_to?: string;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  tenant_id?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  property_id?: number;

  @IsNumber()
  @Type(() => Number)
  @IsOptional()
  contract_id?: number;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  page?: number = 1;

  @IsNumber()
  @Type(() => Number)
  @Min(1)
  @IsOptional()
  limit?: number = 50;

  @IsEnum(PaymentSortField)
  @IsOptional()
  sort?: PaymentSortField = PaymentSortField.CREATED_AT;

  @IsEnum(['ASC', 'DESC'])
  @IsOptional()
  order?: 'ASC' | 'DESC' = 'DESC';
}
