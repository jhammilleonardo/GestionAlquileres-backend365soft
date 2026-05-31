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

    const [
      [incomeResult],
      [previousIncomeResult],
      [pendingPaymentResult],
      [maintenanceResult],
      [expiringResult],
      [delinquentResult],
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
    ]);

    return {
      occupancyRate: `${occupancyRate.toFixed(2)}%`,
      occupancyRateValue:
        totalUnits > 0 ? occupiedUnits / totalUnits : 0,
      totalUnits,
      occupiedUnits,
      availableUnits: Math.max(totalUnits - occupiedUnits, 0),
      monthlyIncome: this.toNumber(incomeResult?.total),
      monthlyIncomePrevious: this.toNumber(previousIncomeResult?.total),
      pendingPaymentsCount: this.toNumber(pendingPaymentResult?.count),
      delinquentCount: this.toNumber(delinquentResult?.count),
      activeMaintenanceCount: this.toNumber(maintenanceResult?.count),
      expiringContracts: this.toNumber(expiringResult?.count),
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
