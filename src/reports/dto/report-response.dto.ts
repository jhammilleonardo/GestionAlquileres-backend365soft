import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class RentRollReportRowDto {
  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiPropertyOptional({ example: 3, nullable: true })
  unit_id: number | null;

  @ApiPropertyOptional({ example: 'A-101', nullable: true })
  unit_number: string | null;

  @ApiPropertyOptional({ example: 12, nullable: true })
  tenant_id: number | null;

  @ApiPropertyOptional({ example: 'Luis Rojas', nullable: true })
  tenant_name: string | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  contract_id: number | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  rent_amount: string | number | null;

  @ApiProperty({ example: 0 })
  current_balance: string | number;
}

export class VacancyReportRowDto {
  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiProperty({ example: 3 })
  unit_id: number;

  @ApiProperty({ example: 'A-101' })
  unit_number: string;

  @ApiPropertyOptional({ example: 2, nullable: true })
  bedrooms: number | null;

  @ApiPropertyOptional({ example: 1, nullable: true })
  bathrooms: number | null;

  @ApiPropertyOptional({ example: 3000, nullable: true })
  market_rent: string | number | null;

  @ApiProperty({ example: 15 })
  days_vacant: string | number;
}

export class DelinquencyReportRowDto {
  @ApiProperty({ example: 12 })
  tenant_id: number;

  @ApiProperty({ example: 'Luis Rojas' })
  tenant_name: string;

  @ApiProperty({ example: 'luis@example.com' })
  tenant_email: string;

  @ApiPropertyOptional({ example: '+59171111111', nullable: true })
  tenant_phone: string | null;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiProperty({ example: 1 })
  contract_id: number;

  @ApiProperty({ example: 1500 })
  total_owed: string | number;

  @ApiProperty({ example: 20 })
  max_days_late: string | number;
}

export class ProfitAndLossReportRowDto {
  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiProperty({ example: 3000 })
  income: string | number;

  @ApiProperty({ example: 500 })
  expenses: string | number;

  @ApiProperty({ example: 2500 })
  net_result: string | number;
}

export class MaintenanceReportRowDto {
  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiProperty({ example: 5 })
  open_requests: string | number;

  @ApiProperty({ example: 2 })
  urgent_requests: string | number;

  @ApiProperty({ example: 12 })
  completed_requests: string | number;

  @ApiProperty({ example: 3.5 })
  avg_resolution_days: string | number;

  @ApiProperty({ example: 1200 })
  estimated_cost: string | number;
}

export class OwnerStatementReportRowDto {
  @ApiProperty({ example: 3 })
  owner_id: number;

  @ApiProperty({ example: 'Maria Perez' })
  owner_name: string;

  @ApiProperty({ example: 8 })
  property_id: number;

  @ApiProperty({ example: 'Departamento Centro' })
  property_name: string;

  @ApiProperty({ example: 3000 })
  gross_income: string | number;

  @ApiProperty({ example: 300 })
  commission: string | number;

  @ApiProperty({ example: 450 })
  deductions: string | number;

  @ApiProperty({ example: 2250 })
  net_transfer: string | number;

  @ApiProperty({ example: 'pending' })
  status: string;
}

export class CashFlowReportRowDto {
  @ApiProperty({ example: '2026-05' })
  movement: string;

  @ApiProperty({ example: 12000 })
  inflow: string | number;

  @ApiProperty({ example: 7200 })
  outflow: string | number;

  @ApiProperty({ example: 4800 })
  net: string | number;
}

export class BudgetVsActualReportRowDto {
  @ApiProperty({ example: 'Ingresos' })
  line: string;

  @ApiProperty({ example: 10000 })
  budget: string | number;

  @ApiProperty({ example: 12000 })
  actual: string | number;

  @ApiProperty({ example: 2000 })
  variance: string | number;
}

export class ReportKpisResponseDto {
  @ApiProperty({ example: '87.50%' })
  occupancyRate: string;

  @ApiProperty({ example: 0.875 })
  occupancyRateValue: number;

  @ApiProperty({ example: 40 })
  totalUnits: number;

  @ApiProperty({ example: 35 })
  occupiedUnits: number;

  @ApiProperty({ example: 5 })
  availableUnits: number;

  @ApiProperty({ example: 105000 })
  monthlyIncome: number;

  @ApiProperty({ example: 98000 })
  monthlyIncomePrevious: number;

  @ApiProperty({ example: 6 })
  pendingPaymentsCount: number;

  @ApiProperty({ example: 2 })
  delinquentCount: number;

  @ApiProperty({ example: 3 })
  activeMaintenanceCount: number;

  @ApiProperty({ example: 4 })
  expiringContracts: number;
}
