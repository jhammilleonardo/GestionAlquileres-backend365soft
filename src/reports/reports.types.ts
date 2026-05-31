export type ReportCellValue = string | number | boolean | Date | null;
export type ReportRow = Record<string, ReportCellValue>;
export type ReportTable = ReportRow[];
export type ReportQueryParam = string | number | string[];

export type RentRollRow = ReportRow & {
  property_id: number;
  property_name: string;
  unit_id: number | null;
  unit_number: string | null;
  tenant_id: number | null;
  tenant_name: string | null;
  tenant_email: string | null;
  contract_id: number | null;
  rent_amount: string | number | null;
  security_deposit: string | number | null;
  start_date: Date | null;
  end_date: Date | null;
  contract_status: string | null;
  current_balance: string | number;
};

export type VacancyRow = ReportRow & {
  property_id: number;
  property_name: string;
  unit_id: number;
  unit_number: string;
  bedrooms: number | null;
  bathrooms: number | null;
  square_meters: string | number | null;
  market_rent: string | number | null;
  days_vacant: string | number;
};

export type DelinquencyRow = ReportRow & {
  tenant_id: number;
  tenant_name: string;
  tenant_email: string;
  tenant_phone: string | null;
  unit_number: string | null;
  property_id: number;
  property_name: string;
  contract_id: number;
  total_owed: string | number;
  max_days_late: string | number;
};

export type ProfitAndLossRow = ReportRow & {
  property_id: number;
  property_name: string;
  income: string | number;
  expenses: string | number;
  net_result: string | number;
};

export interface ReportKpis {
  occupancyRate: string;
  occupancyRateValue: number;
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  monthlyIncome: number;
  monthlyIncomePrevious: number;
  pendingPaymentsCount: number;
  delinquentCount: number;
  activeMaintenanceCount: number;
  expiringContracts: number;
}

export type ReportData = ReportTable | ReportKpis;

export interface CountQueryResult {
  count: string | number | null;
}

export interface SumQueryResult {
  total: string | number | null;
}
