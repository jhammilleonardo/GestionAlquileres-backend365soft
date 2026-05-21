import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class TenantConfigResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'BO' })
  country: string;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 'es' })
  language: string;

  @ApiProperty({ example: 'America/La_Paz' })
  timezone: string;

  @ApiProperty({ example: 'DD/MM/YYYY' })
  date_format: string;

  @ApiProperty({ example: 'LONG_TERM' })
  rental_type: string;

  @ApiProperty({ example: ['qr_accl', 'transferencia'] })
  payment_methods: unknown;

  @ApiProperty({
    example: { internal: true, email: false, whatsapp: false },
  })
  notification_channels: unknown;

  @ApiProperty({ example: 10 })
  commission_percentage: string | number;

  @ApiProperty({ example: 5 })
  grace_days_late_fee: number;

  @ApiProperty({ example: 2 })
  late_fee_percentage: string | number;

  @ApiPropertyOptional({ example: ['Jardinería'] })
  custom_expense_categories?: unknown;

  @ApiPropertyOptional({ example: true })
  setup_completed?: boolean;
}
