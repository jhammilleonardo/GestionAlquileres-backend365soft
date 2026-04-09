import { IsEmail, IsString, MinLength, IsOptional, IsEnum } from 'class-validator';
import { TenantCountry } from '../../tenants/dto/create-tenant.dto';

export class RegisterAdminDto {
  // Datos del Tenant
  @IsOptional()
  @IsString()
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
  @MinLength(6)
  password: string;

  @IsOptional()
  @IsString()
  phone?: string;
}
