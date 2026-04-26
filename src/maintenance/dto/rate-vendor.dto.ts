import { IsInt, Min, Max, IsOptional, IsString, MaxLength } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RateVendorDto {
  @ApiProperty({ example: 4, description: 'Calificación del proveedor (1-5)' })
  @IsInt()
  @Min(1)
  @Max(5)
  rating: number;

  @ApiPropertyOptional({ example: 'Trabajo bien hecho y puntual', description: 'Comentario sobre el trabajo' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  comment?: string;
}
