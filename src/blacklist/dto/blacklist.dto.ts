import {
  IsString,
  IsNotEmpty,
  IsEnum,
  IsOptional,
  Length,
  MinLength,
} from 'class-validator';
import { DocumentType } from '../enums/blacklist.enum';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para agregar un inquilino a la lista negra
 * Solo ADMIN puede usar este DTO
 */
export class AddToBlacklistDto {
  @ApiProperty({
    description: 'Nombre completo del inquilino',
    example: 'Juan Pérez García',
  })
  @IsString()
  @IsNotEmpty()
  @Length(3, 255)
  full_name: string;

  @ApiProperty({
    description: 'Número de documento de identidad',
    example: '12345678',
  })
  @IsString()
  @IsNotEmpty()
  @Length(5, 50)
  document_number: string;

  @ApiProperty({
    description: 'Tipo de documento',
    enum: DocumentType,
    example: DocumentType.CEDULA,
  })
  @IsEnum(DocumentType)
  @IsNotEmpty()
  document_type: DocumentType;

  @ApiProperty({
    description: 'Motivo por el cual se agrega a la lista negra (obligatorio)',
    example:
      'Incumplimiento de contrato, daños a la propiedad, no pago de renta',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(10)
  reason: string;
}

/**
 * DTO para verificar si un documento está en la lista negra
 * Público para inquilinos y admins
 */
export class CheckBlacklistDto {
  @ApiProperty({
    description: 'Número de documento a verificar',
    example: '12345678',
  })
  @IsString()
  @IsNotEmpty()
  document_number: string;

  @ApiPropertyOptional({
    description: 'Tipo de documento (opcional, por defecto CEDULA)',
    enum: DocumentType,
    example: DocumentType.CEDULA,
  })
  @IsEnum(DocumentType)
  @IsOptional()
  document_type?: DocumentType;
}

/**
 * Response DTO para verificación de blacklist
 */
export class BlacklistCheckResponseDto {
  is_blacklisted: boolean;
  message?: string;
  details?: {
    id: number;
    full_name: string;
    document_number: string;
    document_type: string;
    reason: string;
    reported_by_tenant_id: number;
    created_at: Date;
    reported_by_tenant_name?: string;
  };
}

/**
 * Response DTO para agregar a blacklist
 */
export class BlacklistAddResponseDto {
  success: boolean;
  id?: number;
  message: string;
}

/**
 * Response DTO para listar blacklist (solo ADMIN)
 */
export class BlacklistListResponseDto {
  id: number;
  full_name: string;
  document_number: string;
  document_type: string;
  reason: string;
  reported_by_tenant_id: number;
  reported_by_tenant_name: string;
  admin_email: string;
  created_at: Date;
  updated_at: Date;
}
