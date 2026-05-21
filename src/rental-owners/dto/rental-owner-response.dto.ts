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
}

export class RentalOwnerMessageResponseDto {
  @ApiProperty({ example: 'Propietario desactivado correctamente' })
  message: string;
}

export class RentalOwnerAccountResponseDto {
  @ApiProperty({ example: 'ana@example.com' })
  email: string;

  @ApiProperty({ example: 'TempPass123!' })
  temporary_password: string;
}
