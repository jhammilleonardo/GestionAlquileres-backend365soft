import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ContractStatus } from '../contracts/enums/contract-status.enum';
import { MaintenanceStage } from '../maintenance/enums/maintenance-stage.enum';
import { PaymentStatus } from '../payments/enums';
import { UnitStatus } from '../units/enums/unit-status.enum';
import { ReportFilterDto } from './dto/report-filter.dto';
import {
  CountQueryResult,
  DelinquencyRow,
  BudgetVsActualReportRow,
  CashFlowReportRow,
  MaintenanceReportRow,
  OwnerStatementReportRow,
  ProfitAndLossRow,
  RentRollRow,
  ReportKpis,
  ReportQueryParam,
  SumQueryResult,
  VacancyRow,
} from './reports.types';

const INACTIVE_PROPERTY_STATUS = 'INACTIVO';
const ACTIVE_RENT_ROLL_STATUSES = [
  ContractStatus.ACTIVO,
  ContractStatus.POR_VENCER,
  ContractStatus.PENDIENTE,
];
const FINISHED_CONTRACT_STATUSES = [
  ContractStatus.FINALIZADO,
  ContractStatus.CANCELADO,
];
const ACTIVE_MAINTENANCE_STAGES = [
  MaintenanceStage.REPORTED,
  MaintenanceStage.ASSIGNED,
  MaintenanceStage.SCHEDULED,
  MaintenanceStage.IN_PROGRESS,
  MaintenanceStage.REPORTED_TO_OWNER,
];

@Injectable()
export class ReportsService {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getRentRoll(filters: ReportFilterDto): Promise<RentRollRow[]> {
    const contractStatuses = filters.status
      ? [filters.status]
      : ACTIVE_RENT_ROLL_STATUSES;
    const params: ReportQueryParam[] = [
      contractStatuses,
      PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];

    let propertyFilter = '';
    if (filters.property_id) {
      params.push(filters.property_id);
      propertyFilter = `AND p.id = $${params.length}`;
    }

    const query = `
      SELECT
        p.id AS property_id,
        p.title AS property_name,
        u.id AS unit_id,
        u.unit_number,
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.email AS tenant_email,
        c.id AS contract_id,
        c.monthly_rent AS rent_amount,
        c.deposit_amount AS security_deposit,
        c.start_date,
        c.end_date,
        c.status::text AS contract_status,
        COALESCE((
          SELECT SUM(pay.amount)
          FROM payments pay
          WHERE pay.contract_id = c.id
            AND pay.status::text <> $2
        ), 0) AS current_balance
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      LEFT JOIN contracts c
        ON c.property_id = p.id
       AND c.unit_id IS NOT DISTINCT FROM u.id
       AND c.status::text = ANY($1::text[])
      LEFT JOIN "user" t ON t.id = c.tenant_id
      WHERE p.status <> $3
      ${propertyFilter}
      ORDER BY p.title, u.unit_number NULLS FIRST
    `;

    return this.dataSource.query<RentRollRow[]>(query, params);
  }

  async getVacancies(filters: ReportFilterDto): Promise<VacancyRow[]> {
    const params: ReportQueryParam[] = [
      FINISHED_CONTRACT_STATUSES,
      UnitStatus.AVAILABLE,
      INACTIVE_PROPERTY_STATUS,
    ];

    let propertyFilter = '';
    if (filters.property_id) {
      params.push(filters.property_id);
      propertyFilter = `AND p.id = $${params.length}`;
    }

    const query = `
      SELECT
        p.id AS property_id,
        p.title AS property_name,
        u.id AS unit_id,
        u.unit_number,
        u.bedrooms,
        u.bathrooms,
        u.square_meters,
        COALESCE(u.price_per_month, p.monthly_rent) AS market_rent,
        (
          CURRENT_DATE - COALESCE((
            SELECT c.end_date
            FROM contracts c
            WHERE c.unit_id = u.id
              AND c.status::text = ANY($1::text[])
            ORDER BY c.end_date DESC
            LIMIT 1
          ), u.created_at::date)
        ) AS days_vacant
      FROM properties p
      JOIN units u ON u.property_id = p.id
      WHERE u.status = $2
        AND p.status <> $3
      ${propertyFilter}
      ORDER BY days_vacant DESC, p.title, u.unit_number
    `;

    return this.dataSource.query<VacancyRow[]>(query, params);
  }

  async getDelinquency(filters: ReportFilterDto): Promise<DelinquencyRow[]> {
    const params: ReportQueryParam[] = [
      filters.status ?? PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];
    const paymentStatusFilter = filters.status
      ? 'i.status::text = $1'
      : 'i.status::text <> $1';

    let propertyFilter = '';
    if (filters.property_id) {
      params.push(filters.property_id);
      propertyFilter = `AND p.id = $${params.length}`;
    }

    const query = `
      SELECT
        t.id AS tenant_id,
        t.name AS tenant_name,
        t.email AS tenant_email,
        t.phone AS tenant_phone,
        u.unit_number,
        p.id AS property_id,
        p.title AS property_name,
        c.id AS contract_id,
        SUM(i.amount) AS total_owed,
        MAX(CURRENT_DATE - i.due_date) AS max_days_late
      FROM payments i
      JOIN contracts c ON c.id = i.contract_id
      JOIN "user" t ON t.id = c.tenant_id
      LEFT JOIN units u ON u.id = c.unit_id
      JOIN properties p ON p.id = c.property_id
      WHERE ${paymentStatusFilter}
        AND i.due_date IS NOT NULL
        AND i.due_date < CURRENT_DATE
        AND p.status <> $2
      ${propertyFilter}
      GROUP BY t.id, u.id, p.id, c.id
      ORDER BY total_owed DESC
    `;

    return this.dataSource.query<DelinquencyRow[]>(query, params);
  }

  async getPnL(filters: ReportFilterDto): Promise<ProfitAndLossRow[]> {
    const params: ReportQueryParam[] = [PaymentStatus.APPROVED];

    let incomeFilter = '';
    let expenseFilter = '';
    let propertyIncomeFilter = '';
    let propertyExpenseFilter = '';
    let propertyFilter = '';

    if (filters.from) {
      params.push(filters.from);
      incomeFilter += ` AND pay.payment_date >= $${params.length}`;
      expenseFilter += ` AND exp.date >= $${params.length}`;
    }

    if (filters.to) {
      params.push(filters.to);
      incomeFilter += ` AND pay.payment_date <= $${params.length}`;
      expenseFilter += ` AND exp.date <= $${params.length}`;
    }

    if (filters.property_id) {
      params.push(filters.property_id);
      propertyIncomeFilter = ` AND pay.property_id = $${params.length}`;
      propertyExpenseFilter = ` AND exp.property_id = $${params.length}`;
      propertyFilter = ` AND p.id = $${params.length}`;
    }

    params.push(INACTIVE_PROPERTY_STATUS);
    const activePropertyParam = params.length;

    const query = `
      WITH income AS (
        SELECT pay.property_id, SUM(pay.amount) AS total_income
        FROM payments pay
        WHERE pay.status::text = $1
          ${incomeFilter}
          ${propertyIncomeFilter}
        GROUP BY pay.property_id
      ),
      expenses AS (
        SELECT exp.property_id, SUM(exp.amount) AS total_expenses
        FROM expenses exp
        WHERE 1 = 1
          ${expenseFilter}
          ${propertyExpenseFilter}
        GROUP BY exp.property_id
      )
      SELECT
        p.id AS property_id,
        p.title AS property_name,
        COALESCE(i.total_income, 0) AS income,
        COALESCE(e.total_expenses, 0) AS expenses,
        (COALESCE(i.total_income, 0) - COALESCE(e.total_expenses, 0)) AS net_result
      FROM properties p
      LEFT JOIN income i ON p.id = i.property_id
      LEFT JOIN expenses e ON p.id = e.property_id
      WHERE p.status <> $${activePropertyParam}
      ${propertyFilter}
      ORDER BY p.title
    `;

    return this.dataSource.query<ProfitAndLossRow[]>(query, params);
  }

  async getMaintenance(
    filters: ReportFilterDto,
  ): Promise<MaintenanceReportRow[]> {
    const params: ReportQueryParam[] = [INACTIVE_PROPERTY_STATUS];
    let propertyFilter = '';
    let expensePropertyFilter = '';

    if (filters.property_id) {
      params.push(filters.property_id);
      propertyFilter = `AND p.id = $${params.length}`;
      expensePropertyFilter = `AND exp.property_id = $${params.length}`;
    }

    let maintenanceDateFilter = '';
    let expenseDateFilter = '';
    if (filters.from) {
      params.push(filters.from);
      maintenanceDateFilter += ` AND mr.created_at::date >= $${params.length}`;
      expenseDateFilter += ` AND exp.date >= $${params.length}`;
    }

    if (filters.to) {
      params.push(filters.to);
      maintenanceDateFilter += ` AND mr.created_at::date <= $${params.length}`;
      expenseDateFilter += ` AND exp.date <= $${params.length}`;
    }

    const query = `
      WITH maintenance_costs AS (
        SELECT exp.property_id, SUM(exp.amount) AS estimated_cost
        FROM expenses exp
        WHERE LOWER(exp.category) IN ('maintenance', 'mantenimiento')
          ${expensePropertyFilter}
          ${expenseDateFilter}
        GROUP BY exp.property_id
      )
      SELECT
        p.id AS property_id,
        p.title AS property_name,
        COUNT(mr.id) FILTER (
          WHERE mr.current_stage <> 'COMPLETED' AND mr.status <> 'COMPLETED'
        ) AS open_requests,
        COUNT(mr.id) FILTER (
          WHERE mr.priority = 'HIGH' AND mr.current_stage <> 'COMPLETED'
        ) AS urgent_requests,
        COUNT(mr.id) FILTER (
          WHERE mr.current_stage = 'COMPLETED' OR mr.status = 'COMPLETED'
        ) AS completed_requests,
        COALESCE(AVG(
          CASE
            WHEN mr.completed_at IS NOT NULL
            THEN EXTRACT(EPOCH FROM (mr.completed_at - mr.created_at)) / 86400
            ELSE NULL
          END
        ), 0) AS avg_resolution_days,
        COALESCE(mc.estimated_cost, 0) AS estimated_cost
      FROM properties p
      LEFT JOIN maintenance_requests mr
        ON mr.property_id = p.id
       ${maintenanceDateFilter}
      LEFT JOIN maintenance_costs mc ON mc.property_id = p.id
      WHERE p.status <> $1
      ${propertyFilter}
      GROUP BY p.id, p.title, mc.estimated_cost
      ORDER BY open_requests DESC, urgent_requests DESC, p.title
    `;

    return this.dataSource.query<MaintenanceReportRow[]>(query, params);
  }

  async getOwnerStatements(
    filters: ReportFilterDto,
  ): Promise<OwnerStatementReportRow[]> {
    const params: ReportQueryParam[] = [INACTIVE_PROPERTY_STATUS];
    let propertyFilter = '';
    let periodFilter = '';

    if (filters.property_id) {
      params.push(filters.property_id);
      propertyFilter = `AND p.id = $${params.length}`;
    }

    if (filters.from) {
      params.push(filters.from);
      periodFilter += ` AND MAKE_DATE(os.period_year, os.period_month, 1) >= DATE_TRUNC('month', $${params.length}::date)::date`;
    }

    if (filters.to) {
      params.push(filters.to);
      periodFilter += ` AND MAKE_DATE(os.period_year, os.period_month, 1) <= DATE_TRUNC('month', $${params.length}::date)::date`;
    }

    if (filters.status) {
      params.push(filters.status);
      periodFilter += ` AND os.status = $${params.length}`;
    }

    const query = `
      SELECT
        ro.id AS owner_id,
        ro.name AS owner_name,
        p.id AS property_id,
        p.title AS property_name,
        COALESCE(SUM(os.gross_rent), 0) AS gross_income,
        COALESCE(SUM(os.management_commission), 0) AS commission,
        COALESCE(SUM(os.maintenance_deduction), 0) AS deductions,
        COALESCE(SUM(os.net_amount), 0) AS net_transfer,
        CASE
          WHEN COUNT(*) FILTER (WHERE os.status = 'pending') > 0 THEN 'pending'
          ELSE 'transferred'
        END AS status
      FROM owner_statements os
      JOIN rental_owners ro ON ro.id = os.rental_owner_id
      JOIN properties p ON p.id = os.property_id
      WHERE p.status <> $1
      ${propertyFilter}
      ${periodFilter}
      GROUP BY ro.id, ro.name, p.id, p.title
      ORDER BY net_transfer DESC, p.title
    `;

    return this.dataSource.query<OwnerStatementReportRow[]>(query, params);
  }

  async getCashFlow(filters: ReportFilterDto): Promise<CashFlowReportRow[]> {
    const params: ReportQueryParam[] = [PaymentStatus.APPROVED];
    let paymentFilter = '';
    let expenseFilter = '';
    let ownerFilter = '';

    if (filters.property_id) {
      params.push(filters.property_id);
      paymentFilter += ` AND pay.property_id = $${params.length}`;
      expenseFilter += ` AND exp.property_id = $${params.length}`;
      ownerFilter += ` AND os.property_id = $${params.length}`;
    }

    if (filters.from) {
      params.push(filters.from);
      paymentFilter += ` AND pay.payment_date >= $${params.length}`;
      expenseFilter += ` AND exp.date >= $${params.length}`;
      ownerFilter += ` AND MAKE_DATE(os.period_year, os.period_month, 1) >= DATE_TRUNC('month', $${params.length}::date)::date`;
    }

    if (filters.to) {
      params.push(filters.to);
      paymentFilter += ` AND pay.payment_date <= $${params.length}`;
      expenseFilter += ` AND exp.date <= $${params.length}`;
      ownerFilter += ` AND MAKE_DATE(os.period_year, os.period_month, 1) <= DATE_TRUNC('month', $${params.length}::date)::date`;
    }

    const query = `
      WITH inflows AS (
        SELECT DATE_TRUNC('month', pay.payment_date)::date AS month, SUM(pay.amount) AS amount
        FROM payments pay
        WHERE pay.status::text = $1
          ${paymentFilter}
        GROUP BY month
      ),
      expense_outflows AS (
        SELECT DATE_TRUNC('month', exp.date)::date AS month, SUM(exp.amount) AS amount
        FROM expenses exp
        WHERE 1 = 1
          ${expenseFilter}
        GROUP BY month
      ),
      owner_outflows AS (
        SELECT MAKE_DATE(os.period_year, os.period_month, 1) AS month, SUM(os.net_amount) AS amount
        FROM owner_statements os
        WHERE 1 = 1
          ${ownerFilter}
        GROUP BY month
      ),
      months AS (
        SELECT month FROM inflows
        UNION
        SELECT month FROM expense_outflows
        UNION
        SELECT month FROM owner_outflows
      )
      SELECT
        TO_CHAR(m.month, 'YYYY-MM') AS movement,
        COALESCE(i.amount, 0) AS inflow,
        (COALESCE(e.amount, 0) + COALESCE(o.amount, 0)) AS outflow,
        (COALESCE(i.amount, 0) - COALESCE(e.amount, 0) - COALESCE(o.amount, 0)) AS net
      FROM months m
      LEFT JOIN inflows i ON i.month = m.month
      LEFT JOIN expense_outflows e ON e.month = m.month
      LEFT JOIN owner_outflows o ON o.month = m.month
      ORDER BY m.month DESC
      LIMIT 12
    `;

    return this.dataSource.query<CashFlowReportRow[]>(query, params);
  }

  async getBudgetVsActual(
    filters: ReportFilterDto,
  ): Promise<BudgetVsActualReportRow[]> {
    const pnl = await this.getPnL(filters);
    const income = pnl.reduce((sum, row) => sum + this.toNumber(row.income), 0);
    const expenses = pnl.reduce(
      (sum, row) => sum + this.toNumber(row.expenses),
      0,
    );
    const net = income - expenses;

    const previousFilters: ReportFilterDto = { ...filters };
    delete previousFilters.from;
    delete previousFilters.to;
    const previousPnl = await this.getPreviousMonthPnL(previousFilters);
    const previousIncome = previousPnl.reduce(
      (sum, row) => sum + this.toNumber(row.income),
      0,
    );
    const previousExpenses = previousPnl.reduce(
      (sum, row) => sum + this.toNumber(row.expenses),
      0,
    );
    const budgetIncome = previousIncome > 0 ? previousIncome : income;
    const budgetExpenses = previousExpenses > 0 ? previousExpenses : expenses;
    const budgetNet = budgetIncome - budgetExpenses;

    return [
      {
        line: 'Ingresos',
        budget: budgetIncome,
        actual: income,
        variance: income - budgetIncome,
      },
      {
        line: 'Gastos',
        budget: budgetExpenses,
        actual: expenses,
        variance: budgetExpenses - expenses,
      },
      {
        line: 'Resultado neto',
        budget: budgetNet,
        actual: net,
        variance: net - budgetNet,
      },
    ];
  }

  private getPreviousMonthPnL(
    filters: ReportFilterDto,
  ): Promise<ProfitAndLossRow[]> {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth(), 0);

    return this.getPnL({
      ...filters,
      from: firstDay.toISOString().slice(0, 10),
      to: lastDay.toISOString().slice(0, 10),
    });
  }

  async getKpis(filters: ReportFilterDto): Promise<ReportKpis> {
    const unitParams: ReportQueryParam[] = [INACTIVE_PROPERTY_STATUS];
    let unitPropertyFilter = '';
    if (filters.property_id) {
      unitParams.push(filters.property_id);
      unitPropertyFilter = `AND p.id = $${unitParams.length}`;
    }

    const [totalUnitsResult] = await this.dataSource.query<CountQueryResult[]>(
      `
        SELECT COUNT(*) AS count
        FROM units u
        JOIN properties p ON p.id = u.property_id
        WHERE p.status <> $1
        ${unitPropertyFilter}
      `,
      unitParams,
    );

    const occupiedUnitParams: ReportQueryParam[] = [
      UnitStatus.OCCUPIED,
      INACTIVE_PROPERTY_STATUS,
    ];
    let occupiedPropertyFilter = '';
    if (filters.property_id) {
      occupiedUnitParams.push(filters.property_id);
      occupiedPropertyFilter = `AND p.id = $${occupiedUnitParams.length}`;
    }

    const [occupiedUnitsResult] = await this.dataSource.query<
      CountQueryResult[]
    >(
      `
          SELECT COUNT(*) AS count
          FROM units u
          JOIN properties p ON p.id = u.property_id
          WHERE u.status = $1
            AND p.status <> $2
          ${occupiedPropertyFilter}
        `,
      occupiedUnitParams,
    );

    const totalUnits = this.toNumber(totalUnitsResult?.count);
    const occupiedUnits = this.toNumber(occupiedUnitsResult?.count);
    const occupancyRate =
      totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    const incomeParams: ReportQueryParam[] = [
      PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];
    let incomePropertyFilter = '';
    if (filters.property_id) {
      incomeParams.push(filters.property_id);
      incomePropertyFilter = `AND p.id = $${incomeParams.length}`;
    }

    const pendingPaymentParams: ReportQueryParam[] = [
      PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];
    let pendingPaymentPropertyFilter = '';
    if (filters.property_id) {
      pendingPaymentParams.push(filters.property_id);
      pendingPaymentPropertyFilter = `AND p.id = $${pendingPaymentParams.length}`;
    }

    const maintenanceParams: ReportQueryParam[] = [
      ACTIVE_MAINTENANCE_STAGES,
      INACTIVE_PROPERTY_STATUS,
    ];
    let maintenancePropertyFilter = '';
    if (filters.property_id) {
      maintenanceParams.push(filters.property_id);
      maintenancePropertyFilter = `AND p.id = $${maintenanceParams.length}`;
    }

    // Contratos por vencer (próximos 30 días) y morosos comparten el filtro de propiedad
    const expiringParams: ReportQueryParam[] = [
      INACTIVE_PROPERTY_STATUS,
      ContractStatus.FINALIZADO,
      ContractStatus.CANCELADO,
    ];
    let expiringPropertyFilter = '';
    if (filters.property_id) {
      expiringParams.push(filters.property_id);
      expiringPropertyFilter = `AND p.id = $${expiringParams.length}`;
    }

    const delinquentParams: ReportQueryParam[] = [
      PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];
    let delinquentPropertyFilter = '';
    if (filters.property_id) {
      delinquentParams.push(filters.property_id);
      delinquentPropertyFilter = `AND p.id = $${delinquentParams.length}`;
    }

    const expectedParams: ReportQueryParam[] = [
      ContractStatus.FINALIZADO,
      ContractStatus.CANCELADO,
      INACTIVE_PROPERTY_STATUS,
    ];
    let expectedPropertyFilter = '';
    if (filters.property_id) {
      expectedParams.push(filters.property_id);
      expectedPropertyFilter = `AND p.id = $${expectedParams.length}`;
    }

    const recentMaintenanceParams: ReportQueryParam[] = [
      ACTIVE_MAINTENANCE_STAGES,
      INACTIVE_PROPERTY_STATUS,
    ];
    let recentMaintenancePropertyFilter = '';
    if (filters.property_id) {
      recentMaintenanceParams.push(filters.property_id);
      recentMaintenancePropertyFilter = `AND p.id = $${recentMaintenanceParams.length}`;
    }

    const expiringListParams: ReportQueryParam[] = [
      INACTIVE_PROPERTY_STATUS,
      ContractStatus.FINALIZADO,
      ContractStatus.CANCELADO,
    ];
    let expiringListPropertyFilter = '';
    if (filters.property_id) {
      expiringListParams.push(filters.property_id);
      expiringListPropertyFilter = `AND p.id = $${expiringListParams.length}`;
    }

    const delinquentListParams: ReportQueryParam[] = [
      PaymentStatus.APPROVED,
      INACTIVE_PROPERTY_STATUS,
    ];
    let delinquentListPropertyFilter = '';
    if (filters.property_id) {
      delinquentListParams.push(filters.property_id);
      delinquentListPropertyFilter = `AND p.id = $${delinquentListParams.length}`;
    }

    const pendingApplicationsParams: ReportQueryParam[] = [
      ['PENDIENTE', 'EN_REVISION'],
    ];
    let pendingApplicationsPropertyFilter = '';
    if (filters.property_id) {
      pendingApplicationsParams.push(filters.property_id);
      pendingApplicationsPropertyFilter = `AND ra.property_id = $${pendingApplicationsParams.length}`;
    }

    const violationsParams: ReportQueryParam[] = [
      INACTIVE_PROPERTY_STATUS,
      ['open', 'notified'],
    ];
    let violationsPropertyFilter = '';
    if (filters.property_id) {
      violationsParams.push(filters.property_id);
      violationsPropertyFilter = `AND p.id = $${violationsParams.length}`;
    }

    const inspectionsParams: ReportQueryParam[] = [
      ['scheduled', 'in_progress'],
    ];
    let inspectionsPropertyFilter = '';
    if (filters.property_id) {
      inspectionsParams.push(filters.property_id);
      inspectionsPropertyFilter = `AND p.id = $${inspectionsParams.length}`;
    }

    const expensesParams: ReportQueryParam[] = [INACTIVE_PROPERTY_STATUS];
    let expensesPropertyFilter = '';
    if (filters.property_id) {
      expensesParams.push(filters.property_id);
      expensesPropertyFilter = `AND p.id = $${expensesParams.length}`;
    }

    const [
      [incomeResult],
      [previousIncomeResult],
      [pendingPaymentResult],
      [maintenanceResult],
      [expiringResult],
      [delinquentResult],
      [expectedResult],
      recentMaintenanceResult,
      expiringContractsListResult,
      delinquentListResult,
      pendingApplicationsResult,
      openViolationsResult,
      upcomingInspectionsResult,
      [expensesResult],
      recentExpensesResult,
    ] = await Promise.all([
      this.dataSource.query<SumQueryResult[]>(
        `
            SELECT COALESCE(SUM(pay.amount), 0) AS total
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            WHERE pay.status::text = $1
              AND p.status <> $2
              AND DATE_TRUNC('month', pay.payment_date) = DATE_TRUNC('month', CURRENT_DATE)
            ${incomePropertyFilter}
          `,
        incomeParams,
      ),
      this.dataSource.query<SumQueryResult[]>(
        `
            SELECT COALESCE(SUM(pay.amount), 0) AS total
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            WHERE pay.status::text = $1
              AND p.status <> $2
              AND DATE_TRUNC('month', pay.payment_date)
                  = DATE_TRUNC('month', CURRENT_DATE - INTERVAL '1 month')
            ${incomePropertyFilter}
          `,
        incomeParams,
      ),
      this.dataSource.query<CountQueryResult[]>(
        `
            SELECT COUNT(*) AS count
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            WHERE pay.status::text <> $1
              AND p.status <> $2
            ${pendingPaymentPropertyFilter}
          `,
        pendingPaymentParams,
      ),
      this.dataSource.query<CountQueryResult[]>(
        `
            SELECT COUNT(*) AS count
            FROM maintenance_requests mr
            JOIN properties p ON p.id = mr.property_id
            WHERE mr.current_stage = ANY($1::text[])
              AND p.status <> $2
            ${maintenancePropertyFilter}
          `,
        maintenanceParams,
      ),
      this.dataSource.query<CountQueryResult[]>(
        `
            SELECT COUNT(*) AS count
            FROM contracts c
            JOIN properties p ON p.id = c.property_id
            WHERE p.status <> $1
              AND c.status::text NOT IN ($2, $3)
              AND c.end_date >= CURRENT_DATE
              AND c.end_date <= CURRENT_DATE + INTERVAL '30 days'
            ${expiringPropertyFilter}
          `,
        expiringParams,
      ),
      this.dataSource.query<CountQueryResult[]>(
        `
            SELECT COUNT(DISTINCT pay.tenant_id) AS count
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            WHERE pay.status::text <> $1
              AND p.status <> $2
              AND pay.due_date IS NOT NULL
              AND pay.due_date < CURRENT_DATE
            ${delinquentPropertyFilter}
          `,
        delinquentParams,
      ),
      this.dataSource.query<SumQueryResult[]>(
        `
            SELECT COALESCE(SUM(c.monthly_rent), 0) AS total
            FROM contracts c
            JOIN properties p ON p.id = c.property_id
            WHERE c.status::text NOT IN ($1, $2)
              AND p.status <> $3
            ${expectedPropertyFilter}
          `,
        expectedParams,
      ),
      this.dataSource.query<
        {
          id: number;
          title: string;
          property_name: string;
          stage: string;
          days_open: number;
        }[]
      >(
        `
            SELECT mr.id, mr.title, p.title AS property_name,
              mr.current_stage::text AS stage,
              GREATEST(EXTRACT(DAY FROM NOW() - mr.created_at)::int, 0) AS days_open
            FROM maintenance_requests mr
            JOIN properties p ON p.id = mr.property_id
            WHERE mr.current_stage = ANY($1::text[])
              AND p.status <> $2
            ${recentMaintenancePropertyFilter}
            ORDER BY mr.created_at DESC
            LIMIT 5
          `,
        recentMaintenanceParams,
      ),
      this.dataSource.query<
        {
          id: number;
          tenant_name: string;
          property_name: string;
          end_date: string;
          days_left: number;
        }[]
      >(
        `
            SELECT c.id,
              COALESCE(u.name, 'Sin inquilino') AS tenant_name,
              p.title AS property_name,
              TO_CHAR(c.end_date, 'YYYY-MM-DD') AS end_date,
              (c.end_date - CURRENT_DATE)::int AS days_left
            FROM contracts c
            JOIN properties p ON p.id = c.property_id
            LEFT JOIN "user" u ON u.id = c.tenant_id
            WHERE p.status <> $1
              AND c.status::text NOT IN ($2, $3)
              AND c.end_date >= CURRENT_DATE
              AND c.end_date <= CURRENT_DATE + INTERVAL '30 days'
            ${expiringListPropertyFilter}
            ORDER BY c.end_date ASC
            LIMIT 5
          `,
        expiringListParams,
      ),
      this.dataSource.query<
        {
          tenant_id: number;
          tenant_name: string;
          property_name: string;
          amount_owed: number;
          days_overdue: number;
        }[]
      >(
        `
            SELECT pay.tenant_id,
              u.name AS tenant_name,
              p.title AS property_name,
              COALESCE(SUM(pay.amount), 0)::numeric AS amount_owed,
              COALESCE(MAX(CURRENT_DATE - pay.due_date::date), 0)::int AS days_overdue
            FROM payments pay
            JOIN properties p ON p.id = pay.property_id
            JOIN "user" u ON u.id = pay.tenant_id
            WHERE pay.status::text <> $1
              AND p.status <> $2
              AND pay.due_date IS NOT NULL
              AND pay.due_date < CURRENT_DATE
            ${delinquentListPropertyFilter}
            GROUP BY pay.tenant_id, u.name, p.title
            ORDER BY amount_owed DESC
            LIMIT 5
          `,
        delinquentListParams,
      ),
      this.dataSource.query<
        {
          id: number;
          applicant_name: string;
          property_name: string;
          status: string;
          created_at: string;
        }[]
      >(
        `
            SELECT ra.id,
              COALESCE(ra.personal_data->>'full_name', 'Sin nombre') AS applicant_name,
              p.title AS property_name,
              ra.status::text AS status,
              TO_CHAR(ra.created_at, 'YYYY-MM-DD') AS created_at
            FROM rental_applications ra
            JOIN properties p ON p.id = ra.property_id
            WHERE ra.status::text = ANY($1::text[])
            ${pendingApplicationsPropertyFilter}
            ORDER BY ra.created_at DESC
            LIMIT 5
          `,
        pendingApplicationsParams,
      ),
      this.dataSource.query<
        {
          id: number;
          type: string;
          description: string;
          property_name: string;
          tenant_name: string | null;
          status: string;
          created_at: string;
        }[]
      >(
        `
            SELECT v.id, v.type, v.description,
              p.title AS property_name,
              COALESCE(u.name, '') AS tenant_name,
              v.status,
              TO_CHAR(v.created_at, 'YYYY-MM-DD') AS created_at
            FROM violations v
            JOIN properties p ON p.id = v.property_id
            LEFT JOIN "user" u ON u.id = v.tenant_id
            WHERE v.status = ANY($2::text[])
              AND p.status <> $1
            ${violationsPropertyFilter}
            ORDER BY v.created_at ASC
            LIMIT 5
          `,
        violationsParams,
      ),
      this.dataSource.query<
        {
          id: number;
          type: string;
          property_name: string;
          scheduled_date: string;
          status: string;
          days_until: number;
        }[]
      >(
        `
            SELECT i.id, i.type,
              p.title AS property_name,
              TO_CHAR(i.scheduled_date, 'YYYY-MM-DD') AS scheduled_date,
              i.status,
              GREATEST((i.scheduled_date::date - CURRENT_DATE)::int, 0) AS days_until
            FROM inspections i
            JOIN properties p ON p.id = i.property_id
            WHERE i.status = ANY($1::text[])
              AND i.scheduled_date >= CURRENT_DATE
            ${inspectionsPropertyFilter}
            ORDER BY i.scheduled_date ASC
            LIMIT 5
          `,
        inspectionsParams,
      ),
      this.dataSource.query<SumQueryResult[]>(
        `
            SELECT COALESCE(SUM(e.amount), 0) AS total
            FROM expenses e
            JOIN properties p ON p.id = e.property_id
            WHERE DATE_TRUNC('month', e.date) = DATE_TRUNC('month', CURRENT_DATE)
              AND p.status <> $1
            ${expensesPropertyFilter}
          `,
        expensesParams,
      ),
      this.dataSource.query<
        {
          id: number;
          category: string;
          amount: number;
          property_name: string;
          vendor_name: string;
          date: string;
        }[]
      >(
        `
            SELECT e.id, e.category, e.amount,
              p.title AS property_name,
              COALESCE(e.vendor_name, 'Sin proveedor') AS vendor_name,
              TO_CHAR(e.date, 'YYYY-MM-DD') AS date
            FROM expenses e
            JOIN properties p ON p.id = e.property_id
            WHERE DATE_TRUNC('month', e.date) = DATE_TRUNC('month', CURRENT_DATE)
              AND p.status <> $1
            ${expensesPropertyFilter}
            ORDER BY e.date DESC
            LIMIT 5
          `,
        expensesParams,
      ),
    ]);

    return {
      occupancyRate: `${occupancyRate.toFixed(2)}%`,
      occupancyRateValue: totalUnits > 0 ? occupiedUnits / totalUnits : 0,
      totalUnits,
      occupiedUnits,
      availableUnits: Math.max(totalUnits - occupiedUnits, 0),
      monthlyIncome: this.toNumber(incomeResult?.total),
      monthlyIncomePrevious: this.toNumber(previousIncomeResult?.total),
      monthlyExpected: this.toNumber(expectedResult?.total),
      pendingPaymentsCount: this.toNumber(pendingPaymentResult?.count),
      delinquentCount: this.toNumber(delinquentResult?.count),
      activeMaintenanceCount: this.toNumber(maintenanceResult?.count),
      expiringContracts: this.toNumber(expiringResult?.count),
      recentMaintenance: recentMaintenanceResult.map((r) => ({
        id: r.id,
        title: r.title,
        propertyName: r.property_name,
        stage: r.stage,
        daysOpen: r.days_open,
      })),
      expiringContractsList: expiringContractsListResult.map((r) => ({
        id: r.id,
        tenantName: r.tenant_name,
        propertyName: r.property_name,
        endDate: r.end_date,
        daysLeft: r.days_left,
      })),
      delinquentList: delinquentListResult.map((r) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name,
        propertyName: r.property_name,
        amountOwed: this.toNumber(r.amount_owed),
        daysOverdue: r.days_overdue,
      })),
      pendingApplicationsList: pendingApplicationsResult.map((r) => ({
        id: r.id,
        applicantName: r.applicant_name,
        propertyName: r.property_name,
        status: r.status,
        createdAt: r.created_at,
      })),
      openViolationsCount: openViolationsResult.length,
      openViolationsList: openViolationsResult.map((r) => ({
        id: r.id,
        type: r.type,
        description: r.description,
        propertyName: r.property_name,
        tenantName: r.tenant_name ?? '',
        status: r.status,
        createdAt: r.created_at,
      })),
      upcomingInspectionsCount: upcomingInspectionsResult.length,
      upcomingInspectionsList: upcomingInspectionsResult.map((r) => ({
        id: r.id,
        type: r.type,
        propertyName: r.property_name,
        scheduledDate: r.scheduled_date,
        status: r.status,
        daysUntil: r.days_until,
      })),
      monthlyExpenses: this.toNumber(expensesResult?.total),
      recentExpensesList: recentExpensesResult.map((r) => ({
        id: r.id,
        category: r.category,
        amount: this.toNumber(r.amount),
        propertyName: r.property_name,
        vendorName: r.vendor_name,
        date: r.date,
      })),
    };
  }

  private toNumber(value: string | number | null | undefined): number {
    if (typeof value === 'number') {
      return value;
    }

    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }
}
