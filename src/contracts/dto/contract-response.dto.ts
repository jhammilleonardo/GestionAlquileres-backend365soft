import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { ContractStatus } from '../enums/contract-status.enum';

export class ContractResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  contract_number: string;

  @ApiProperty({ example: 12 })
  tenant_id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiPropertyOptional({ example: 3, nullable: true })
  unit_id?: number | null;

  @ApiProperty({ enum: ContractStatus, example: ContractStatus.ACTIVO })
  status: ContractStatus;

  @ApiProperty({ example: '2026-06-01' })
  start_date: string | Date;

  @ApiProperty({ example: '2027-05-31' })
  end_date: string | Date;

  @ApiPropertyOptional({ example: 12, nullable: true })
  duration_months?: number | null;

  @ApiProperty({ example: 3000 })
  monthly_rent: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 5 })
  payment_day: number;

  @ApiProperty({ example: 3000 })
  deposit_amount: number;

  @ApiPropertyOptional({ example: 'TRANSFER', nullable: true })
  payment_method?: string | null;

  @ApiPropertyOptional({ example: 2, nullable: true })
  late_fee_percentage?: number | null;

  @ApiPropertyOptional({ example: 5, nullable: true })
  grace_days?: number | null;

  @ApiPropertyOptional({ type: String, isArray: true, nullable: true })
  included_services?: string[] | string | null;

  @ApiPropertyOptional({ example: 'Departamento Centro', nullable: true })
  property_title?: string | null;

  @ApiPropertyOptional({ example: 'ACTIVA', nullable: true })
  property_status?: string | null;

  @ApiPropertyOptional({ example: 'Av. Siempre Viva 123', nullable: true })
  street_address?: string | null;

  @ApiPropertyOptional({ example: 'La Paz', nullable: true })
  city?: string | null;

  @ApiPropertyOptional({ example: 'Bolivia', nullable: true })
  country?: string | null;

  @ApiPropertyOptional({ example: 'Luis Rojas', nullable: true })
  tenant_name?: string | null;

  @ApiPropertyOptional({ example: 'luis@example.com', nullable: true })
  tenant_email?: string | null;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  created_at: Date;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  updated_at: Date;
}

export class ContractMetricsResponseDto {
  @ApiProperty({ example: 25 })
  total_contracts: number;

  @ApiProperty({ example: 18 })
  active_contracts: number;

  @ApiProperty({ example: 3 })
  draft_contracts: number;

  @ApiProperty({ example: 2 })
  contracts_expiring_soon: number;

  @ApiProperty({ example: 54000 })
  monthly_revenue: number;

  @ApiProperty({ example: 3000 })
  avg_rent: number;
}

export class ContractPdfResponseDto {
  @ApiPropertyOptional({
    example: '/tmp/contracts/mi-empresa/contract-1.pdf',
    nullable: true,
  })
  path?: string;

  @ApiProperty({ example: '/storage/contracts/mi-empresa/1/contract.pdf' })
  url: string;

  @ApiProperty({
    example:
      'https://api.example.com/storage/contracts/mi-empresa/1/contract.pdf',
  })
  fullUrl: string;
}

export class CurrentContractEmptyResponseDto {
  @ApiProperty({ example: 'No tienes un contrato activo en este momento' })
  message: string;

  contract: null;
}

export class ContractStatusUpdateDto {
  @ApiProperty({ enum: ContractStatus, example: ContractStatus.CANCELADO })
  status: ContractStatus;

  @ApiPropertyOptional({ example: 'Cancelado por solicitud administrativa.' })
  reason?: string;
}
