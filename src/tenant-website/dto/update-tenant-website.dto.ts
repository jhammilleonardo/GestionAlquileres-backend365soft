import {
  IsString,
  IsOptional,
  IsEmail,
  IsUrl,
  IsObject,
  MaxLength,
  Matches,
} from 'class-validator';

export class UpdateTenantWebsiteDto {
  @IsString()
  @IsOptional()
  @MaxLength(100)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'subdomain must contain only lowercase letters, numbers, and hyphens',
  })
  subdomain?: string;

  @IsString()
  @IsOptional()
  company_description?: string;

  @IsUrl()
  @IsOptional()
  logo_url?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'primary_color must be a valid hex color (#RRGGBB)',
  })
  primary_color?: string;

  @IsString()
  @IsOptional()
  @Matches(/^#[0-9A-Fa-f]{6}$/, {
    message: 'secondary_color must be a valid hex color (#RRGGBB)',
  })
  secondary_color?: string;

  @IsEmail()
  @IsOptional()
  contact_email?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  contact_phone?: string;

  @IsObject()
  @IsOptional()
  social_links?: Record<string, string>;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  meta_title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(500)
  meta_description?: string;
}
