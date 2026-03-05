import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * DTO para el callback del sistema QR (notificación del banco MC4/SIP)
 */
export class QrCallbackDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(50)
  alias: string;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  numeroOrdenOriginante?: string;

  @IsNumber()
  @IsOptional()
  monto?: number;

  @IsString()
  @IsOptional()
  @MaxLength(30)
  idQr?: string;

  @IsString()
  @IsOptional()
  @MaxLength(10)
  moneda?: string;

  @IsDateString()
  @IsOptional()
  fechaproceso?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  cuentaCliente?: string;

  @IsString()
  @IsOptional()
  @MaxLength(250)
  nombreCliente?: string;

  @IsString()
  @IsOptional()
  @MaxLength(50)
  documentoCliente?: string;
}
