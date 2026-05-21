import {
  IsDateString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para el callback del sistema QR (notificación del banco MC4/SIP)
 */
export class QrCallbackDto {
  @ApiProperty({ example: 'QR365T7T20260520153000a1b2c3d4' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  alias: string;

  @ApiPropertyOptional({ example: 'ORD-123456' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  numeroOrdenOriginante?: string;

  @ApiPropertyOptional({ example: 1250.5 })
  @IsNumber()
  @IsOptional()
  monto?: number;

  @ApiPropertyOptional({ example: 'MC4-QR-789' })
  @IsString()
  @IsOptional()
  @MaxLength(30)
  idQr?: string;

  @ApiPropertyOptional({ example: 'BOB' })
  @IsString()
  @IsOptional()
  @MaxLength(10)
  moneda?: string;

  @ApiPropertyOptional({ example: '2026-05-20T15:30:00.000Z' })
  @IsDateString()
  @IsOptional()
  fechaproceso?: string;

  @ApiPropertyOptional({ example: '1000001234' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  cuentaCliente?: string;

  @ApiPropertyOptional({ example: 'Luis Rojas' })
  @IsString()
  @IsOptional()
  @MaxLength(250)
  nombreCliente?: string;

  @ApiPropertyOptional({ example: '1234567' })
  @IsString()
  @IsOptional()
  @MaxLength(50)
  documentoCliente?: string;
}
