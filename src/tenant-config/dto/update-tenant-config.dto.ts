import {
  IsEnum,
  IsString,
  IsArray,
  IsBoolean,
  IsNumber,
  IsOptional,
  IsObject,
  IsTimeZone,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export enum CountryEnum {
  US = 'US',
  BO = 'BO',
  GT = 'GT',
  HN = 'HN',
}

export enum CurrencyEnum {
  USD = 'USD',
  BOB = 'BOB',
  GTQ = 'GTQ',
  HNL = 'HNL',
}

export enum LanguageEnum {
  EN = 'en',
  ES = 'es',
}

export enum RentalTypeEnum {
  SHORT_TERM = 'SHORT_TERM',
  LONG_TERM = 'LONG_TERM',
  BOTH = 'BOTH',
}

export class NotificationChannelsDto {
  @IsBoolean()
  email: boolean;

  @IsBoolean()
  whatsapp: boolean;

  @IsBoolean()
  internal: boolean;
}

export class UpdateTenantConfigDto {
  @ApiPropertyOptional({ enum: CountryEnum })
  @IsOptional()
  @IsEnum(CountryEnum)
  country?: CountryEnum;

  @ApiPropertyOptional({ enum: CurrencyEnum })
  @IsOptional()
  @IsEnum(CurrencyEnum)
  currency?: CurrencyEnum;

  @ApiPropertyOptional({ enum: LanguageEnum })
  @IsOptional()
  @IsEnum(LanguageEnum)
  language?: LanguageEnum;

  @ApiPropertyOptional({ example: 'America/La_Paz' })
  @IsOptional()
  @IsString()
  @IsTimeZone()
  timezone?: string;

  @ApiPropertyOptional({ example: 'DD/MM/YYYY' })
  @IsOptional()
  @IsString()
  date_format?: string;

  @ApiPropertyOptional({ enum: RentalTypeEnum })
  @IsOptional()
  @IsEnum(RentalTypeEnum)
  rental_type?: RentalTypeEnum;

  @ApiPropertyOptional({ example: ['qr_accl', 'transferencia'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  payment_methods?: string[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsObject()
  @ValidateNested()
  @Type(() => NotificationChannelsDto)
  notification_channels?: NotificationChannelsDto;

  @ApiPropertyOptional({ example: 10 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  commission_percentage?: number;

  @ApiPropertyOptional({ example: 5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  grace_days_late_fee?: number;

  @ApiPropertyOptional({ example: 2.5 })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  late_fee_percentage?: number;

  @ApiPropertyOptional({ example: ['Jardinería', 'Reparaciones Menores'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  custom_expense_categories?: string[];
}
