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

export type MaintenanceReportRow = ReportRow & {
  property_id: number;
  property_name: string;
  open_requests: string | number;
  urgent_requests: string | number;
  completed_requests: string | number;
  avg_resolution_days: string | number;
  estimated_cost: string | number;
};

export type OwnerStatementReportRow = ReportRow & {
  owner_id: number;
  owner_name: string;
  property_id: number;
  property_name: string;
  gross_income: string | number;
  commission: string | number;
  deductions: string | number;
  net_transfer: string | number;
  status: string;
};

export type CashFlowReportRow = ReportRow & {
  movement: string;
  inflow: string | number;
  outflow: string | number;
  net: string | number;
};

export type BudgetVsActualReportRow = ReportRow & {
  line: string;
  budget: string | number;
  actual: string | number;
  variance: string | number;
};

export interface DashboardMaintenanceItem {
  id: number;
  title: string;
  propertyName: string;
  stage: string;
  daysOpen: number;
}

export interface DashboardContractItem {
  id: number;
  tenantName: string;
  propertyName: string;
  endDate: string;
  daysLeft: number;
}

export interface DashboardDelinquentItem {
  tenantId: number;
  tenantName: string;
  propertyName: string;
  amountOwed: number;
  daysOverdue: number;
}

export interface DashboardApplicationItem {
  id: number;
  applicantName: string;
  propertyName: string;
  status: string;
  createdAt: string;
}

export interface DashboardViolationItem {
  id: number;
  type: string;
  description: string;
  propertyName: string;
  tenantName: string;
  status: string;
  createdAt: string;
}

export interface DashboardInspectionItem {
  id: number;
  type: string;
  propertyName: string;
  scheduledDate: string;
  status: string;
  daysUntil: number;
}

export interface DashboardExpenseItem {
  id: number;
  category: string;
  amount: number;
  propertyName: string;
  vendorName: string;
  date: string;
}

export interface ReportKpis {
  occupancyRate: string;
  occupancyRateValue: number;
  totalUnits: number;
  occupiedUnits: number;
  availableUnits: number;
  monthlyIncome: number;
  monthlyIncomePrevious: number;
  monthlyExpected: number;
  pendingPaymentsCount: number;
  delinquentCount: number;
  activeMaintenanceCount: number;
  expiringContracts: number;
  recentMaintenance: DashboardMaintenanceItem[];
  expiringContractsList: DashboardContractItem[];
  delinquentList: DashboardDelinquentItem[];
  pendingApplicationsList: DashboardApplicationItem[];
  openViolationsCount: number;
  openViolationsList: DashboardViolationItem[];
  upcomingInspectionsCount: number;
  upcomingInspectionsList: DashboardInspectionItem[];
  monthlyExpenses: number;
  recentExpensesList: DashboardExpenseItem[];
}

export type ReportData = ReportTable | ReportKpis;

export interface CountQueryResult {
  count: string | number | null;
}

export interface SumQueryResult {
  total: string | number | null;
}
