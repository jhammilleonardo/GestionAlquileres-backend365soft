import {
  IsInt,
  IsString,
  MaxLength,
  IsOptional,
  IsArray,
  ArrayMaxSize,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 12, description: 'ID del usuario destinatario' })
  @IsInt()
  recipient_id: number;

  // El cuerpo es opcional cuando se adjuntan archivos. El servicio valida que
  // exista al menos texto o archivos.
  @ApiPropertyOptional({ example: 'Hola, ¿podemos coordinar la inspección?' })
  @IsString()
  @MaxLength(4000)
  @IsOptional()
  body?: string;

  @ApiPropertyOptional({
    description: 'Archivos adjuntos (URLs devueltas por /messages/upload)',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(3, { message: 'Máximo 3 archivos permitidos' })
  @IsOptional()
  files?: string[];
}
