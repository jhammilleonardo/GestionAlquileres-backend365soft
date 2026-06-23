import {
  IsString,
  IsOptional,
  IsEmail,
  IsArray,
  IsNotEmpty,
  ValidateNested,
  ArrayMaxSize,
  MaxLength,
  Matches,
  registerDecorator,
  ValidationOptions,
  ValidationArguments,
} from 'class-validator';
import { Type } from 'class-transformer';

/** Tope de tarjetas por sección (features de inicio, valores de nosotros). */
export const MAX_SECTION_CARDS = 12;

/** Redes sociales permitidas en `social_links`. */
const ALLOWED_SOCIAL_KEYS = ['facebook', 'instagram', 'whatsapp'] as const;
const MAX_SOCIAL_VALUE_LENGTH = 300;

/** Tarjeta genérica de sección (features de inicio, valores de nosotros). */
export class SectionCardDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  title!: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(400)
  description!: string;
}

/**
 * Valida que `social_links` sea un mapa cuyas claves estén en la allowlist y
 * cuyos valores sean strings cortos. Evita guardar objetos arbitrarios por API.
 */
function IsSocialLinksMap(options?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isSocialLinksMap',
      target: object.constructor,
      propertyName,
      options,
      validator: {
        validate(value: unknown) {
          if (
            value === null ||
            typeof value !== 'object' ||
            Array.isArray(value)
          ) {
            return false;
          }
          return Object.entries(value as Record<string, unknown>).every(
            ([key, val]) =>
              (ALLOWED_SOCIAL_KEYS as readonly string[]).includes(key) &&
              typeof val === 'string' &&
              val.length <= MAX_SOCIAL_VALUE_LENGTH,
          );
        },
        defaultMessage(args: ValidationArguments) {
          return `${args.property} solo admite las claves ${ALLOWED_SOCIAL_KEYS.join(', ')} con valores de texto (máx ${MAX_SOCIAL_VALUE_LENGTH})`;
        },
      },
    });
  };
}

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

  // Nota: logo_url y hero_image_url NO se aceptan aquí. Solo se establecen
  // server-side vía los endpoints de subida (POST .../logo y .../hero), que
  // generan la ruta de almacenamiento. Así se evita inyectar valores arbitrarios.

  @IsString()
  @IsOptional()
  @MaxLength(200)
  hero_title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  hero_subtitle?: string;

  @IsString()
  @IsOptional()
  about_content?: string;

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(MAX_SECTION_CARDS)
  @ValidateNested({ each: true })
  @Type(() => SectionCardDto)
  home_features?: SectionCardDto[];

  @IsArray()
  @IsOptional()
  @ArrayMaxSize(MAX_SECTION_CARDS)
  @ValidateNested({ each: true })
  @Type(() => SectionCardDto)
  about_values?: SectionCardDto[];

  @IsString()
  @IsOptional()
  @MaxLength(200)
  cta_title?: string;

  @IsString()
  @IsOptional()
  @MaxLength(300)
  cta_subtitle?: string;

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

  @IsOptional()
  @IsSocialLinksMap()
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
