import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength, Matches } from 'class-validator';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_MESSAGE,
  PASSWORD_STRENGTH_REGEX,
} from '../../common/constants/security.constants';

export class ChangeVendorPasswordDto {
  @ApiProperty({ example: 'ClaveActual123', description: 'Contraseña vigente' })
  @IsString()
  currentPassword: string;

  @ApiProperty({
    example: 'NuevaClaveSegura123',
    minLength: PASSWORD_MIN_LENGTH,
    description:
      'Nueva contraseña (mínimo 8, con mayúscula, minúscula y número).',
  })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  newPassword: string;
}
