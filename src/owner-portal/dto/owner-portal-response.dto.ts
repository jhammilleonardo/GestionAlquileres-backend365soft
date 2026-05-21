import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class OwnerDashboardResponseDto {
  @ApiProperty({ example: 4 })
  property_count: number;

  @ApiProperty({ example: 3 })
  active_tenant_count: number;

  @ApiProperty({ example: 12000 })
  pending_balance: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 2 })
  active_maintenance_count: number;

  @ApiProperty({ example: 1 })
  pending_statements: number;
}

export class OwnerPropertyResponseDto {
  @ApiProperty({ example: 8 })
  id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  title: string;

  @ApiProperty({ example: 'DISPONIBLE' })
  status: string;

  @ApiProperty({ example: '3000.00' })
  monthly_rent: string;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 100 })
  ownership_percentage: number;

  @ApiProperty({ example: true })
  is_primary: boolean;

  @ApiProperty({ example: 'Av. Siempre Viva 123' })
  street_address: string;

  @ApiProperty({ example: 'La Paz' })
  city: string;

  @ApiProperty({ example: 'Bolivia' })
  country: string;

  @ApiPropertyOptional({ example: 'Luis Rojas', nullable: true })
  current_tenant_name: string | null;

  @ApiPropertyOptional({ example: 'luis@example.com', nullable: true })
  current_tenant_email: string | null;

  @ApiPropertyOptional({ example: 'ACTIVO', nullable: true })
  contract_status: string | null;

  @ApiPropertyOptional({ example: '2027-05-31', nullable: true })
  contract_end_date: string | null;
}

export class OwnerStatementSummaryResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_title: string;

  @ApiProperty({ example: 5 })
  period_month: number;

  @ApiProperty({ example: 2026 })
  period_year: number;

  @ApiProperty({ example: 3000 })
  gross_rent: number;

  @ApiProperty({ example: 200 })
  maintenance_deduction: number;

  @ApiProperty({ example: 300 })
  management_commission: number;

  @ApiProperty({ example: 2500 })
  net_amount: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 'pending' })
  status: string;

  @ApiPropertyOptional({ example: null, nullable: true })
  transferred_at: Date | null;

  @ApiProperty({ example: '2026-05-20T10:00:00.000Z' })
  generated_at: Date;
}

export class OwnerMaintenanceResponseDto {
  @ApiProperty({ example: 10 })
  id: number;

  @ApiProperty({ example: 'MT-2026-0001' })
  ticket_number: string;

  @ApiProperty({ example: 'Fuga de agua' })
  title: string;

  @ApiProperty({ example: 'Fuga en baño principal' })
  description: string;

  @ApiProperty({ example: 'IN_PROGRESS' })
  status: string;

  @ApiProperty({ example: 'HIGH' })
  priority: string;

  @ApiProperty({ example: 'DIAGNOSIS' })
  current_stage: string;

  @ApiProperty({ example: false })
  owner_authorized: boolean;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_title: string;
}

export class OwnerContractResponseDto {
  @ApiProperty({ example: 1 })
  id: number;

  @ApiProperty({ example: 'CTR-2026-0001' })
  contract_number: string;

  @ApiProperty({ example: 'ACTIVO' })
  status: string;

  @ApiProperty({ example: '2026-06-01' })
  start_date: string;

  @ApiProperty({ example: '2027-05-31' })
  end_date: string;

  @ApiProperty({ example: 3000 })
  monthly_rent: number;

  @ApiProperty({ example: 'BOB' })
  currency: string;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_title: string;

  @ApiProperty({ example: 'Luis Rojas' })
  tenant_name: string;

  @ApiProperty({ example: true })
  is_signed: boolean;

  @ApiProperty({ example: '/storage/contracts/mi-empresa/1/contract.pdf' })
  pdf_url: string;
}

export class OwnerMaintenanceAuthorizationResponseDto {
  @ApiProperty({
    example: 'Gasto autorizado. El técnico puede iniciar el trabajo.',
  })
  message: string;
}
