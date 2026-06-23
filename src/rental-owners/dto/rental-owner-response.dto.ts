import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RentalOwnerResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Ana Perez' })
  name: string;

  @ApiPropertyOptional({ example: 'Inversiones Perez SRL', nullable: true })
  company_name?: string | null;

  @ApiProperty({ example: false })
  is_company: boolean;

  @ApiProperty({ example: 'ana@example.com' })
  primary_email: string;

  @ApiProperty({ example: '+59171111111' })
  phone_number: string;

  @ApiProperty({ example: true })
  is_active: boolean;
}

export class RentalOwnerSummaryResponseDto extends RentalOwnerResponseDto {
  @ApiProperty({ example: 3 })
  properties_count: number;

  @ApiProperty({ example: 2500 })
  pending_balance: number;

  @ApiProperty({
    example: true,
    description: 'Si el propietario ya tiene cuenta de portal',
  })
  has_account: boolean;
}

export class RentalOwnerMessageResponseDto {
  @ApiProperty({ example: 'Propietario desactivado correctamente' })
  message: string;
}

export class RentalOwnerInviteResponseDto {
  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({
    example: 'http://localhost:4200/reset-password?token=abc123',
    description:
      'Enlace de un solo uso para que el propietario defina su contraseña',
  })
  inviteUrl: string;

  @ApiProperty({ example: '2026-06-23T12:00:00.000Z' })
  expiresAt: Date;

  @ApiProperty({
    example: true,
    description:
      'true si se creó la cuenta ahora; false si ya existía (reenvío)',
  })
  created: boolean;
}
