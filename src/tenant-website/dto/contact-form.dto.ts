import {
  IsString,
  IsEmail,
  IsOptional,
  IsNotEmpty,
  MaxLength,
} from 'class-validator';

export class ContactFormDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  phone?: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  message: string;

  /**
   * Honeypot anti-spam: campo señuelo oculto en el formulario. Un humano nunca
   * lo rellena; si llega con contenido, el backend descarta el envío en silencio.
   */
  @IsString()
  @IsOptional()
  @MaxLength(255)
  website?: string;
}
