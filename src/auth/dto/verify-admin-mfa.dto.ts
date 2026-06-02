import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

export class VerifyAdminMfaDto {
  @ApiProperty({
    example: '7f3e9b0b1e6e4a0f9b4a2c1d',
    description: 'Identificador temporal del desafio MFA.',
  })
  @IsString()
  @Length(16, 120)
  challenge_id: string;

  @ApiProperty({
    example: '482913',
    description: 'Codigo de 6 digitos enviado al correo del administrador.',
  })
  @IsString()
  @Matches(/^\d{6}$/)
  code: string;
}
