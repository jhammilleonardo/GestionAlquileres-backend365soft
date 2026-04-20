import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { TenantCountry } from '../../tenants/dto/create-tenant.dto';
import { TENANT_SLUG_REGEX } from '../../common/utils/tenant-slug';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_REGEX,
  PASSWORD_STRENGTH_MESSAGE,
} from '../../common/constants/security.constants';

export class RegisterAdminDto {
  // Datos del Tenant
  @IsOptional()
  @IsString()
  @Matches(TENANT_SLUG_REGEX, {
    message:
      'El slug debe empezar con letra minúscula y contener sólo letras minúsculas, dígitos y guiones (3-50 caracteres).',
  })
  slug?: string; // Opcional: si no se proporciona, se genera a partir de company_name

  @IsString()
  company_name: string;

  @IsEnum(TenantCountry)
  country: TenantCountry;

  @IsOptional()
  @IsString()
  currency?: string;

  @IsOptional()
  @IsString()
  locale?: string;

  // Datos del Usuario Admin
  @IsString()
  @MinLength(2)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
