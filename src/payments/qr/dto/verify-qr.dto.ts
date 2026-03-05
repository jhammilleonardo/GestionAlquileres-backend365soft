import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';

/**
 * DTO para verificar el estado de un QR generado
 */
export class VerifyQrDto {
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  qr_id?: number;

  @IsString()
  @IsOptional()
  alias?: string;
}
