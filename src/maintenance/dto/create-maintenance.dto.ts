import {
  IsString,
  IsEnum,
  IsOptional,
  IsBoolean,
  IsArray,
  MaxLength,
  ArrayMaxSize,
  IsNumber,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateMaintenanceDto {
  @ApiProperty({
    description: 'Tipo de solicitud',
    enum: ['MAINTENANCE', 'GENERAL'],
  })
  @IsEnum(['MAINTENANCE', 'GENERAL'])
  request_type: 'MAINTENANCE' | 'GENERAL';

  @ApiPropertyOptional({
    description: 'Categoría (solo para maintenance)',
    enum: [
      'GENERAL',
      'ACCESORIOS',
      'ELECTRICO',
      'CLIMATIZACION',
      'LLAVE_CERRADURA',
      'ILUMINACION',
      'AFUERA',
      'PLOMERIA',
    ],
  })
  @IsEnum([
    'GENERAL',
    'ACCESORIOS',
    'ELECTRICO',
    'CLIMATIZACION',
    'LLAVE_CERRADURA',
    'ILUMINACION',
    'AFUERA',
    'PLOMERIA',
  ])
  @IsOptional()
  category?: string;

  @ApiProperty({
    description: 'Título de la solicitud',
    example: 'Fuga en el baño principal',
  })
  @IsString()
  @MaxLength(200)
  title: string;

  @ApiProperty({
    description: 'Descripción detallada',
    example: 'Hay una fuga en el lavamanos del baño principal...',
  })
  @IsString()
  description: string;

  @ApiPropertyOptional({
    description: '¿Autoriza entrada?',
    enum: ['YES', 'NO', 'NOT_APPLICABLE'],
    default: 'NOT_APPLICABLE',
  })
  @IsEnum(['YES', 'NO', 'NOT_APPLICABLE'])
  @IsOptional()
  permission_to_enter?: 'YES' | 'NO' | 'NOT_APPLICABLE';

  @ApiPropertyOptional({ description: '¿Tiene mascotas?', default: false })
  @IsBoolean()
  @IsOptional()
  has_pets?: boolean;

  @ApiPropertyOptional({
    description: 'Notas de entrada',
    example: 'La llave está debajo de la maceta',
  })
  @IsString()
  @IsOptional()
  entry_notes?: string;

  @ApiPropertyOptional({
    description: 'Lista de archivos (base64 o URLs)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3, { message: 'Máximo 3 archivos permitidos' })
  @IsOptional()
  files?: string[];

  @ApiPropertyOptional({
    description:
      'ID del contrato (opcional, para admin). Para tenants se obtiene automáticamente del contrato activo',
    example: 5,
  })
  @IsNumber()
  @IsOptional()
  contract_id?: number;
}
