import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  IsEnum,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { TenantCountry } from '../../tenants/dto/create-tenant.dto';
import { TENANT_SLUG_REGEX } from '../../common/utils/tenant-slug';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_REGEX,
  PASSWORD_STRENGTH_MESSAGE,
} from '../../common/constants/security.constants';

export class RegisterAdminDto {
  // Datos del Tenant
  @ApiPropertyOptional({
    example: 'mi-empresa',
    description: 'Slug del tenant. Si se omite, se genera desde company_name.',
  })
  @IsOptional()
  @IsString()
  @Matches(TENANT_SLUG_REGEX, {
    message:
      'El slug debe empezar con letra minúscula o dígito y contener sólo letras minúsculas, dígitos y guiones (3-50 caracteres).',
  })
  slug?: string; // Opcional: si no se proporciona, se genera a partir de company_name

  @ApiProperty({ example: 'Mi Empresa SRL' })
  @IsString()
  company_name: string;

  @ApiProperty({ enum: TenantCountry, example: TenantCountry.BO })
  @IsEnum(TenantCountry)
  country: TenantCountry;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsOptional()
  @IsString()
  currency?: string;

  @ApiPropertyOptional({ example: 'es-BO' })
  @IsOptional()
  @IsString()
  locale?: string;

  // Datos del Usuario Admin
  @ApiProperty({ example: 'Ana Perez', minLength: 2 })
  @IsString()
  @MinLength(2)
  name: string;

  @ApiProperty({ example: 'admin@empresa.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  password: string;

  @ApiPropertyOptional({ example: '+59170000000' })
  @IsOptional()
  @IsString()
  phone?: string;
}
