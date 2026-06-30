import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class VendorResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'Plomería Central' })
  name: string;

  @ApiProperty({ example: 'PLUMBING' })
  specialty: string;

  @ApiPropertyOptional({
    example: 'Jardinería',
    nullable: true,
    description: 'Especialidad escrita a mano cuando specialty es "other".',
  })
  specialty_other: string | null;

  @ApiPropertyOptional({ example: '+59171111111', nullable: true })
  phone: string | null;

  @ApiPropertyOptional({ example: 'proveedor@example.com', nullable: true })
  email: string | null;

  @ApiPropertyOptional({ example: 'Av. Principal 123', nullable: true })
  address: string | null;

  @ApiPropertyOptional({ example: 'NIT 123456789', nullable: true })
  tax_id: string | null;

  @ApiPropertyOptional({ example: 'LIC-MNT-2026-001', nullable: true })
  license_number: string | null;

  @ApiPropertyOptional({ example: '2026-12-31', nullable: true })
  insurance_expires_at: string | null;

  @ApiPropertyOptional({ example: '80.00', nullable: true })
  rate_per_hour: string | null;

  @ApiPropertyOptional({ example: '500.00', nullable: true })
  rate_flat: string | null;

  @ApiProperty({ example: true })
  is_active: boolean;

  @ApiPropertyOptional({ example: '4.50', nullable: true })
  average_rating: string | null;

  @ApiPropertyOptional({ example: 12 })
  total_orders?: number;

  @ApiPropertyOptional({ example: 3 })
  open_orders?: number;

  @ApiPropertyOptional({ example: 9 })
  completed_orders?: number;

  @ApiPropertyOptional({ example: 4 })
  expenses_count?: number;

  @ApiPropertyOptional({ example: '120.50' })
  pending_balance?: string;

  @ApiPropertyOptional({ example: '850.00' })
  paid_total?: string;

  @ApiPropertyOptional({ example: 80 })
  compliance_score?: number;

  @ApiPropertyOptional({
    example: true,
    description:
      'Indica si el proveedor ya tiene cuenta de acceso (rol VENDOR).',
  })
  has_account?: boolean;
}

export class VendorMessageResponseDto {
  @ApiProperty({ example: 'Proveedor 1 desactivado correctamente' })
  message: string;
}

export class VendorInviteResponseDto {
  @ApiProperty({ example: 'proveedor@example.com' })
  email: string;

  @ApiProperty({
    example: 'http://localhost:4200/reset-password?token=6f1c…',
    description:
      'Enlace de un solo uso para que el proveedor defina su contraseña. Caduca en 48 h. ' +
      'El admin lo comparte manualmente; nunca se expone la contraseña.',
  })
  inviteUrl: string;

  @ApiProperty({
    example: '2026-07-01T12:00:00.000Z',
    description: 'Fecha y hora de expiración del enlace.',
  })
  expiresAt: Date;

  @ApiProperty({
    example: true,
    description:
      'true si se creó la cuenta del proveedor en esta invitación; false si ya existía.',
  })
  created: boolean;
}

export class VendorHistoryResponseDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'MT-2026-0001' })
  ticket_number: string;

  @ApiProperty({ example: 'Fuga de agua' })
  title: string;

  @ApiProperty({ example: 'COMPLETED' })
  status: string;

  @ApiPropertyOptional({ example: 5, nullable: true })
  vendor_rating: number | null;
}
