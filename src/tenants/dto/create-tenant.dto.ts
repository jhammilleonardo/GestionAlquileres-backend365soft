import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEnum,
} from 'class-validator';

export enum TenantCountry {
  US = 'US',
  BO = 'BO',
  GT = 'GT',
  HN = 'HN',
}

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsString()
  @IsNotEmpty()
  company_name: string;

  @IsEnum(TenantCountry)
  @IsNotEmpty()
  country: TenantCountry;

  @IsString()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  currency?: string;

  @IsString()
  @IsOptional()
  locale?: string;

  @IsBoolean()
  @IsOptional()
  is_active?: boolean;
}
