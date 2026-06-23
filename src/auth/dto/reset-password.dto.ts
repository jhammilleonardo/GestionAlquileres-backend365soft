import { ApiProperty } from '@nestjs/swagger';
import { IsString, Matches, MinLength } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_REGEX,
} from '../../common/constants/security.constants';

export class ResetPasswordDto {
  @ApiProperty({
    example: '6f1c7b0a5d4c3e2b1a9f8e7d6c5b4a3f',
    description: 'Token recibido por correo para restablecer la contrasena.',
  })
  @IsString()
  token: string;

  @ApiProperty({
    example: 'NuevaClaveSegura123',
    minLength: PASSWORD_MIN_LENGTH,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  password: string;
}
