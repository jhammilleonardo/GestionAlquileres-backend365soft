import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
  Matches,
} from 'class-validator';

/**
 * DTO para registrar un contacto/lead en una propiedad
 * Endpoint: POST /:slug/catalog/properties/:id/contact
 * Autenticación: NO requerida (pública)
 */
export class CreatePropertyContactDto {
  /**
   * Nombre completo del interesado
   */
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  name: string;

  /**
   * Email del interesado
   */
  @IsNotEmpty()
  @IsEmail()
  email: string;

  /**
   * Teléfono del interesado
   * Formato: +[país][número] o formato local
   */
  @IsNotEmpty()
  @IsString()
  phone: string;

  /**
   * Mensaje de consulta/interés
   */
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  message: string;

  /**
   * Tipo de consulta (opcional)
   * Ej: 'visita', 'información', 'alquiler'
   */
  @IsOptional()
  @IsString()
  inquiry_type?: string;

  /**
   * Disponibilidad del interesado (opcional)
   * Ej: 'inmediata', 'próximas_semanas', 'próximos_meses'
   */
  @IsOptional()
  @IsString()
  availability?: string;

  /**
   * Documento de identidad (opcional)
   * Para tracking y validación posterior
   */
  @IsOptional()
  @IsString()
  identity_document?: string;
}

/**
 * DTO de respuesta cuando se crea un contacto
 */
export class PropertyContactResponseDto {
  id: number;
  property_id: number;
  name: string;
  email: string;
  phone: string;
  message: string;
  inquiry_type?: string;
  availability?: string;
  created_at: Date;
  status: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED';
  assigned_to?: string;
}
