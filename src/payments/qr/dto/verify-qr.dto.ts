import { IsNumber, IsOptional, IsString } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

/**
 * DTO para verificar el estado de un QR generado
 */
export class VerifyQrDto {
  @ApiPropertyOptional({
    example: 15,
    description: 'ID interno del QR. Se requiere qr_id o alias.',
  })
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  qr_id?: number;

  @ApiPropertyOptional({
    example: 'QR365T7T20260520153000a1b2c3d4',
    description: 'Alias generado por el sistema. Se requiere qr_id o alias.',
  })
  @IsString()
  @IsOptional()
  alias?: string;
}
