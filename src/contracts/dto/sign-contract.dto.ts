import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** ~1.5 MB de base64 — una firma PNG razonable pesa pocos KB. */
const MAX_SIGNATURE_LENGTH = 2_000_000;

/**
 * Métodos de firma electrónica soportados (modelo Dropbox Sign / Buildium):
 * dibujar a mano alzada, escribir el nombre, o subir una imagen de firma.
 */
export const SIGNATURE_METHODS = ['draw', 'type', 'upload'] as const;
export type SignatureMethod = (typeof SIGNATURE_METHODS)[number];

export class SignContractDto {
  @ApiProperty({
    description:
      'Imagen de la firma como data URL PNG (data:image/png;base64,...)',
    example: 'data:image/png;base64,iVBORw0KGgo...',
  })
  @IsString()
  @MaxLength(MAX_SIGNATURE_LENGTH)
  @Matches(/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/=]+$/, {
    message: 'signatureImage debe ser un data URL PNG/JPEG en base64',
  })
  signatureImage: string;

  @ApiPropertyOptional({ enum: SIGNATURE_METHODS, example: 'draw' })
  @IsOptional()
  @IsIn(SIGNATURE_METHODS)
  signatureMethod?: SignatureMethod;
}
