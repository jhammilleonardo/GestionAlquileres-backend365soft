import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @ApiProperty({
    example: '6f1c7b0a5d4c3e2b1a9f8e7d6c5b4a3f',
    description: 'Token recibido por correo para restablecer la contrasena.',
  })
  @IsString()
  token: string;

  @ApiProperty({ example: 'NuevaClaveSegura123' })
  @IsString()
  @MinLength(8)
  password: string;
}
