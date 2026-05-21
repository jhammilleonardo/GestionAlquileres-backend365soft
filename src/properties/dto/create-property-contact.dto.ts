import {
  IsNotEmpty,
  IsString,
  IsEmail,
  IsOptional,
  MinLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para registrar un contacto/lead en una propiedad
 * Endpoint: POST /:slug/catalog/properties/:id/contact
 * Autenticación: NO requerida (pública)
 */
export class CreatePropertyContactDto {
  /**
   * Nombre completo del interesado
   */
  @ApiProperty({ example: 'Luis Rojas' })
  @IsNotEmpty()
  @IsString()
  @MinLength(2)
  name: string;

  /**
   * Email del interesado
   */
  @ApiProperty({ example: 'luis@example.com' })
  @IsNotEmpty()
  @IsEmail()
  email: string;

  /**
   * Teléfono del interesado
   * Formato: +[país][número] o formato local
   */
  @ApiProperty({ example: '+59171111111' })
  @IsNotEmpty()
  @IsString()
  phone: string;

  /**
   * Mensaje de consulta/interés
   */
  @ApiProperty({ example: 'Quisiera coordinar una visita esta semana.' })
  @IsNotEmpty()
  @IsString()
  @MinLength(10)
  message: string;

  /**
   * Tipo de consulta (opcional)
   * Ej: 'visita', 'información', 'alquiler'
   */
  @ApiPropertyOptional({ example: 'visita' })
  @IsOptional()
  @IsString()
  inquiry_type?: string;

  /**
   * Disponibilidad del interesado (opcional)
   * Ej: 'inmediata', 'próximas_semanas', 'próximos_meses'
   */
  @ApiPropertyOptional({ example: 'inmediata' })
  @IsOptional()
  @IsString()
  availability?: string;

  /**
   * Documento de identidad (opcional)
   * Para tracking y validación posterior
   */
  @ApiPropertyOptional({ example: 'CI-1234567' })
  @IsOptional()
  @IsString()
  identity_document?: string;
}

/**
 * DTO de respuesta cuando se crea un contacto
 */
export class PropertyContactResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Luis Rojas' })
  name: string;

  @ApiProperty({ example: 'luis@example.com' })
  email: string;

  @ApiProperty({ example: '+59171111111' })
  phone: string;

  @ApiProperty({ example: 'Quisiera coordinar una visita esta semana.' })
  message: string;

  @ApiPropertyOptional({ example: 'visita' })
  inquiry_type?: string;

  @ApiPropertyOptional({ example: 'inmediata' })
  availability?: string;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ enum: ['PENDING', 'CONTACTED', 'CONVERTED', 'REJECTED'] })
  status: 'PENDING' | 'CONTACTED' | 'CONVERTED' | 'REJECTED';

  @ApiPropertyOptional({ example: 'Admin Demo' })
  assigned_to?: string;
}
