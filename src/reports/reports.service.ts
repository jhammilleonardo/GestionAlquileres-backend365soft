import { Injectable, Logger } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { ReportFilterDto } from './dto/report-filter.dto';

@Injectable()
export class ReportsService {
  private readonly logger = new Logger(ReportsService.name);

  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async getRentRoll(filters: ReportFilterDto): Promise<any[]> {
    let query = `
      SELECT 
        p.id as property_id,
        p.name as property_name,
        u.id as unit_id,
        u.unit_number,
        t.id as tenant_id,
        t.first_name || ' ' || t.last_name as tenant_name,
        c.id as contract_id,
        c.rent_amount,
        c.security_deposit,
        c.start_date,
        c.end_date,
        c.status as contract_status,
        COALESCE(
          (SELECT sum(amount_due - amount_paid) FROM invoices i WHERE i.contract_id = c.id AND i.status != 'PAID'), 0
        ) as current_balance
      FROM properties p
      LEFT JOIN units u ON u.property_id = p.id
      LEFT JOIN contracts c ON c.unit_id = u.id AND c.status = COALESCE($1, c.status) AND c.status IN ('ACTIVE', 'PENDING')
      LEFT JOIN users t ON t.id = c.tenant_id
      WHERE p.deleted_at IS NULL
    `;

    const params: any[] = [filters.status || null];
    let paramCount = 2;

    if (filters.property_id) {
      query += ` AND p.id = $${paramCount}`;
      params.push(filters.property_id);
      paramCount++;
    }

    query += ` ORDER BY p.name, u.unit_number`;

    return this.dataSource.query(query, params);
  }

  async getVacancies(filters: ReportFilterDto): Promise<any[]> {
    let query = `
      SELECT 
        p.name as property_name,
        u.id as unit_id,
        u.unit_number,
        u.beds,
        u.baths,
        u.size,
        u.market_rent,
        (CURRENT_DATE - COALESCE(
          (SELECT end_date FROM contracts c WHERE c.unit_id = u.id AND c.status = 'TERMINATED' ORDER BY end_date DESC LIMIT 1),
          u.created_at::date
        )) as days_vacant
      FROM properties p
      JOIN units u ON u.property_id = p.id
      WHERE u.status = 'VACANT' AND p.deleted_at IS NULL
    `;

    const params: any[] = [];
    let paramCount = 1;

    if (filters.property_id) {
      query += ` AND p.id = $${paramCount}`;
      params.push(filters.property_id);
      paramCount++;
    }

    query += ` ORDER BY days_vacant DESC`;

    return this.dataSource.query(query, params);
  }

  async getDelinquency(filters: ReportFilterDto): Promise<any[]> {
    let query = `
      SELECT 
        t.first_name || ' ' || t.last_name as tenant_name,
        t.email as tenant_email,
        t.phone as tenant_phone,
        u.unit_number,
        p.name as property_name,
        c.id as contract_id,
        SUM(i.amount_due - i.amount_paid) as total_owed,
        MAX(CURRENT_DATE - i.due_date) as max_days_late
      FROM invoices i
      JOIN contracts c ON c.id = i.contract_id
      JOIN users t ON t.id = c.tenant_id
      JOIN units u ON u.id = c.unit_id
      JOIN properties p ON p.id = u.property_id
      WHERE i.status = COALESCE($1, i.status) AND i.status IN ('UNPAID', 'PARTIAL') AND i.due_date < CURRENT_DATE
    `;

    const params: any[] = [filters.status || null];
    let paramCount = 2;

    if (filters.property_id) {
      query += ` AND p.id = $${paramCount}`;
      params.push(filters.property_id);
      paramCount++;
    }

    query += ` GROUP BY t.id, u.id, p.id, c.id ORDER BY total_owed DESC`;

    return this.dataSource.query(query, params);
  }

  async getPnL(filters: ReportFilterDto): Promise<any[]> {
    const params: any[] = [];
    let paramCount = 1;

    let incomeFilter = '';
    let expenseFilter = '';

    if (filters.from) {
      incomeFilter += ` AND p.payment_date >= $${paramCount}`;
      expenseFilter += ` AND e.expense_date >= $${paramCount}`;
      params.push(filters.from);
      paramCount++;
    }
    if (filters.to) {
      incomeFilter += ` AND p.payment_date <= $${paramCount}`;
      expenseFilter += ` AND e.expense_date <= $${paramCount}`;
      params.push(filters.to);
      paramCount++;
    }

    let filterByProperty = '';
    if (filters.property_id) {
      filterByProperty = ` AND r.id = $${paramCount}`;
      params.push(filters.property_id);
    }

    const query = `
      WITH income AS (
        SELECT r.id as property_id, SUM(p.amount) as total_income
        FROM payments p
        JOIN invoices i ON p.invoice_id = i.id
        JOIN contracts c ON i.contract_id = c.id
        JOIN units u ON c.unit_id = u.id
        JOIN properties r ON u.property_id = r.id
        WHERE p.status = 'COMPLETED' ${incomeFilter} ${filterByProperty}
        GROUP BY r.id
      ),
      expenses AS (
        SELECT e.property_id, SUM(e.amount) as total_expenses
        FROM expenses e
        WHERE e.status IN ('PAID', 'APPROVED') ${expenseFilter} ${filters.property_id ? ` AND e.property_id = $${paramCount}` : ''}
        GROUP BY e.property_id
      )
      SELECT
        p.id as property_id,
        p.name as property_name,
        COALESCE(i.total_income, 0) as income,
        COALESCE(e.total_expenses, 0) as expenses,
        (COALESCE(i.total_income, 0) - COALESCE(e.total_expenses, 0)) as net_result
      FROM properties p
      LEFT JOIN income i ON p.id = i.property_id
      LEFT JOIN expenses e ON p.id = e.property_id
      WHERE p.deleted_at IS NULL ${filters.property_id ? ` AND p.id = $${paramCount}` : ''}
    `;

    return this.dataSource.query(query, params);
  }

  async getKpis(filters: ReportFilterDto): Promise<any> {
    let propFilter = '';
    const params: any[] = [];
    if (filters.property_id) {
      propFilter = ` AND property_id = $1`;
      params.push(filters.property_id);
    }

    const [totalUnitsResult] = await this.dataSource.query(`
      SELECT count(*) as count FROM units u 
      JOIN properties p ON p.id = u.property_id 
      WHERE p.deleted_at IS NULL ${filters.property_id ? ` AND p.id = $1` : ''}
    `, params);
    
    const [occupiedUnitsResult] = await this.dataSource.query(`
      SELECT count(*) as count FROM units u
      JOIN properties p ON p.id = u.property_id
      WHERE u.status = 'OCCUPIED' AND p.deleted_at IS NULL ${filters.property_id ? ` AND p.id = $1` : ''}
    `, params);

    const totalUnits = parseInt(totalUnitsResult?.count || '0');
    const occupiedUnits = parseInt(occupiedUnitsResult?.count || '0');
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;

    let incomeQuery = `SELECT SUM(amount) as total FROM payments WHERE status = 'COMPLETED'`;
    // Month to date
    incomeQuery += ` AND date_trunc('month', payment_date) = date_trunc('month', CURRENT_DATE)`;

    const pendingPaymentsQuery = `SELECT count(*) as count FROM invoices WHERE status IN ('UNPAID', 'PARTIAL')`;
    const openMaintenanceQuery = `SELECT count(*) as count FROM maintenance_requests WHERE status IN ('OPEN', 'IN_PROGRESS', 'PENDING')`;

    const [[incomeResult], [pendingPmtResult], [maintResult]] = await Promise.all([
      this.dataSource.query(incomeQuery),
      this.dataSource.query(pendingPaymentsQuery),
      this.dataSource.query(openMaintenanceQuery)
    ]);

    return {
      occupancyRate: occupancyRate.toFixed(2) + '%',
      totalUnits,
      occupiedUnits,
      monthlyIncome: incomeResult?.total || 0,
      pendingPaymentsCount: parseInt(pendingPmtResult?.count || '0'),
      activeMaintenanceCount: parseInt(maintResult?.count || '0')
    };
  }
}
