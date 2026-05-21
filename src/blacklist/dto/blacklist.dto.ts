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
  @ApiProperty({ example: true })
  is_blacklisted: boolean;

  @ApiPropertyOptional({ example: 'Documento encontrado en lista negra' })
  message?: string;

  @ApiPropertyOptional({ type: Object })
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
  @ApiProperty({ example: true })
  success: boolean;

  @ApiPropertyOptional({ example: 1 })
  id?: number;

  @ApiProperty({ example: 'Inquilino agregado exitosamente' })
  message: string;
}

/**
 * Response DTO para listar blacklist (solo ADMIN)
 */
export class BlacklistListResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Juan Pérez García' })
  full_name: string;

  @ApiProperty({ example: '12345678' })
  document_number: string;

  @ApiProperty({ example: 'CEDULA' })
  document_type: string;

  @ApiProperty({ example: 'Incumplimiento de contrato' })
  reason: string;

  @ApiProperty({ example: 1 })
  reported_by_tenant_id: number;

  @ApiProperty({ example: 'Inmobiliaria Demo' })
  reported_by_tenant_name: string;

  @ApiProperty({ example: 'admin@example.com' })
  admin_email: string;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  updated_at: Date;
}

export class BlacklistAuditLogResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'ADD' })
  action: string;

  @ApiProperty({ example: 1 })
  tenant_id: number;

  @ApiPropertyOptional({ example: 10, nullable: true })
  admin_user_id: number | null;

  @ApiPropertyOptional({ example: 'admin@example.com', nullable: true })
  admin_email: string | null;

  @ApiPropertyOptional({ example: 5, nullable: true })
  blacklisted_tenant_id: number | null;

  @ApiPropertyOptional({ example: '12345678', nullable: true })
  document_number: string | null;

  @ApiPropertyOptional({ example: 'Juan Pérez García', nullable: true })
  full_name: string | null;

  @ApiPropertyOptional({ example: '127.0.0.1', nullable: true })
  ip_address: string | null;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;
}
