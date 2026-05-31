import { IsInt, IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class SendMessageDto {
  @ApiProperty({ example: 12, description: 'ID del usuario destinatario' })
  @IsInt()
  recipient_id: number;

  @ApiProperty({ example: 'Hola, ¿podemos coordinar la inspección?' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
