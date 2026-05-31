import { IsString, IsNotEmpty, MaxLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BroadcastMessageDto {
  @ApiProperty({ example: 'Recordatorio: el pago vence el día 5.' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(4000)
  body: string;
}
