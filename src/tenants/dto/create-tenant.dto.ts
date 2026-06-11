import {
  IsString,
  IsBoolean,
  IsOptional,
  IsNotEmpty,
  IsEnum,
  Matches,
} from 'class-validator';
import { TENANT_SLUG_REGEX } from '../../common/utils/tenant-slug';

export enum TenantCountry {
  US = 'US',
  BO = 'BO',
  GT = 'GT',
  HN = 'HN',
}

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @Matches(TENANT_SLUG_REGEX, {
    message:
      'El slug debe empezar con letra minúscula o dígito y contener sólo letras minúsculas, dígitos y guiones (3-50 caracteres).',
  })
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
