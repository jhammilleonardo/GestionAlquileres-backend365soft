import { IsNotEmpty, IsString, IsUrl, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

/** DTO para registrar una URL de calendario externo (iCal) en una unidad. */
export class CreateSyncSourceDto {
  @ApiProperty({ example: 'Calendario externo', maxLength: 120 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @ApiProperty({ example: 'https://example.com/calendar.ics' })
  @IsUrl({ require_protocol: true })
  url: string;
}
