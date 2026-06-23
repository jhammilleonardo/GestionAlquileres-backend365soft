import { IsBoolean, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class SetPublishedDto {
  @ApiPropertyOptional({
    description:
      'Estado deseado de publicación. Si se omite, alterna el estado actual.',
  })
  @IsOptional()
  @IsBoolean()
  published?: boolean;
}
