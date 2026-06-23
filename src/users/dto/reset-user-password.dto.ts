import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_REGEX,
} from '../../common/constants/security.constants';

export class ResetUserPasswordDto {
  @ApiProperty({
    example: 'Password123!',
    minLength: PASSWORD_MIN_LENGTH,
    maxLength: 128,
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(128)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  password: string;

  @ApiPropertyOptional({
    example: 'OldPassword123!',
    description: 'Requerida cuando el usuario cambia su propia contraseña.',
    maxLength: 128,
  })
  @IsOptional()
  @IsString()
  @MaxLength(128)
  current_password?: string;
}
