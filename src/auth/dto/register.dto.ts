import {
  IsEmail,
  IsString,
  MinLength,
  IsOptional,
  Matches,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_STRENGTH_REGEX,
  PASSWORD_STRENGTH_MESSAGE,
} from '../../common/constants/security.constants';

export class RegisterDto {
  @ApiProperty({ example: 'Luis Rojas' })
  @IsString()
  name: string;

  @ApiProperty({ example: 'luis@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'Password123!', minLength: PASSWORD_MIN_LENGTH })
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @Matches(PASSWORD_STRENGTH_REGEX, { message: PASSWORD_STRENGTH_MESSAGE })
  password: string;

  @ApiPropertyOptional({ example: '+59171111111' })
  @IsOptional()
  @IsString()
  phone?: string;
}
