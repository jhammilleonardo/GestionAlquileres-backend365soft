import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { AccountingOutboxService } from '../accounting/accounting-outbox.service';
import { AuditLogsService } from '../audit-logs/audit-logs.service';
import { AuditAction } from '../audit-logs/enums/audit-action.enum';
import { MoneyDecimal, MONEY_ROUNDING } from '../common/money';
import { tenantConnectionStore } from '../common/tenant/tenant-connection.store';
import { runTenantTransaction } from '../common/tenant/tenant-transaction';
import { quoteIdent } from '../common/utils/sql-identifier';
import { Expense } from './entities/expense.entity';
import {
  CreateExpenseDto,
  CreateExpensePaymentDto,
  UpdateExpenseDto,
  ExpenseFiltersDto,
} from './dto';
import {
  ExpenseCategoryEnum,
  ExpensePaymentStatusEnum,
} from './enums/expense-category.enum';

export interface ExpenseSummary {
  total_expenses: string;
  paid_expenses: string;
  pending_balance: string;
  owner_deductions: string;
  reimbursable_total: string;
  by_category: Record<string, string>;
  expense_count: number;
  by_unit?: Record<string, string>;
}

interface ExpenseSumRow {
  total: string | null;
  paid_total?: string | null;
  pending_balance?: string | null;
  owner_deductions?: string | null;
  reimbursable_total?: string | null;
}

interface ExpenseCategorySummaryRow {
  category: string;
  total: string;
}

interface ExpenseUnitSummaryRow {
  unit_id: number | null;
  total: string;
}

interface TenantExpenseConfigRow {
  custom_expense_categories: string[] | null;
}

interface ExpensePaymentInsertRow {
  id: number;
}

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly dataSource: DataSource,
    private readonly accountingOutboxService: AccountingOutboxService,
    private readonly auditLogsService: AuditLogsService,
  ) {}

  /**
   * ========================================
   * ADMIN ENDPOINTS
   * ========================================
   */

  /**
   * Crear un nuevo gasto
   */
  async createExpense(
    dto: CreateExpenseDto,
    userId?: number,
  ): Promise<Expense> {
    // Validar categoría
    await this.validateCategory(dto.category);

    try {
      const expense = this.expenseRepository.create({
        ...dto,
        date: new Date(dto.date),
        due_date: dto.due_date ? new Date(dto.due_date) : null,
        paid_amount:
          (dto.payment_status ?? ExpensePaymentStatusEnum.PAID) ===
          ExpensePaymentStatusEnum.PAID
            ? dto.amount
            : 0,
        paid_date: this.buildPaidDate(
          dto.payment_status ?? ExpensePaymentStatusEnum.PAID,
          dto.paid_date,
          dto.date,
        ),
        recurrence_start_date: dto.recurrence_start_date
          ? new Date(dto.recurrence_start_date)
          : null,
        recurrence_end_date: dto.recurrence_end_date
          ? new Date(dto.recurrence_end_date)
          : null,
        created_by: userId,
      });

      const saved = await this.expenseRepository.save(expense);

      await this.enqueueExpenseAccounting(saved, userId, 'expense.created');

      // Si es un gasto recurrente, generar las instancias futuras
      if (dto.is_recurring && dto.recurrence_interval) {
        await this.generateRecurringExpenses(saved);
      }

      this.logger.log(`Expense created: ${saved.id}`);
      await this.auditLogsService.log({
        userId,
        action: AuditAction.CREATED,
        entityType: 'expense',
        entityId: saved.id,
        newValues: {
          description: dto.description,
          amount: dto.amount,
          category: dto.category,
        },
      });
      return saved;
    } catch (error: unknown) {
      this.logger.error(`Error creating expense: ${getErrorMessage(error)}`);
      throw new BadRequestException('Error al crear el gasto');
    }
  }

  private async enqueueExpenseAccounting(
    expense: Expense,
    userId?: number,
    eventType = 'expense.created',
    extraPayload: Record<string, unknown> = {},
  ): Promise<void> {
    const schemaName = tenantConnectionStore.getStore()?.schemaName;
    if (!schemaName) {
      return;
    }

    const schema = quoteIdent(schemaName);

    await this.dataSource.query(
      `
        UPDATE ${schema}.expenses
        SET accounting_status = $1,
            journal_entry_id = NULL,
            updated_at = NOW()
        WHERE id = $2
      `,
      [
        eventType === 'expense.paid'
          ? 'payment_posting_pending'
          : 'pending_posting',
        expense.id,
      ],
    );

    await this.accountingOutboxService.enqueue({
      schemaName,
      eventType,
      aggregateType: 'expense',
      aggregateId: String(expense.id),
      payload: {
        expenseId: expense.id,
        createdBy: userId ?? null,
        ...extraPayload,
      },
    });
  }

  /**
   * Obtener todos los gastos con filtros
   */
  async findAll(
    filters: ExpenseFiltersDto,
  ): Promise<{ data: Expense[]; total: number }> {
    const query = this.expenseRepository.createQueryBuilder('e');
    query.leftJoinAndSelect('e.property', 'property');

    // El aislamiento por tenant se maneja mediante search_path en la DB

    // Filtro por propiedad
    if (filters.property_id) {
      query.andWhere('e.property_id = :propertyId', {
        propertyId: filters.property_id,
      });
    }

    // Filtro por unidad
    if (filters.unit_id) {
      query.andWhere('e.unit_id = :unitId', { unitId: filters.unit_id });
    }

    // Filtro por categoría
    if (filters.category) {
      query.andWhere('e.category = :category', { category: filters.category });
    }

    if (filters.expense_scope) {
      query.andWhere('e.expense_scope = :expenseScope', {
        expenseScope: filters.expense_scope,
      });
    }

    if (filters.responsibility) {
      query.andWhere('e.responsibility = :responsibility', {
        responsibility: filters.responsibility,
      });
    }

    if (filters.payment_status) {
      query.andWhere('e.payment_status = :paymentStatus', {
        paymentStatus: filters.payment_status,
      });
    }

    if (filters.is_reimbursable !== undefined) {
      query.andWhere('e.is_reimbursable = :isReimbursable', {
        isReimbursable: filters.is_reimbursable,
      });
    }

    // Filtro por rango de fechas
    if (filters.from && filters.to) {
      query.andWhere('e.date BETWEEN :from AND :to', {
        from: new Date(filters.from),
        to: new Date(filters.to),
      });
    } else if (filters.from) {
      query.andWhere('e.date >= :from', { from: new Date(filters.from) });
    } else if (filters.to) {
      query.andWhere('e.date <= :to', { to: new Date(filters.to) });
    }

    // Filtro por gastos recurrentes
    if (filters.is_recurring !== undefined) {
      query.andWhere('e.is_recurring = :isRecurring', {
        isRecurring: filters.is_recurring,
      });
    }

    // Búsqueda en descripción
    if (filters.search) {
      query.andWhere(
        '(e.description ILIKE :search OR e.vendor_name ILIKE :search OR e.invoice_number ILIKE :search)',
        { search: `%${filters.search}%` },
      );
    }

    // Pagination
    const page = Math.max(1, filters.page || 1);
    const limit = Math.min(100, Math.max(1, filters.limit || 20));
    const skip = (page - 1) * limit;

    query.orderBy('e.date', 'DESC').addOrderBy('e.id', 'DESC');

    const [data, total] = await query.skip(skip).take(limit).getManyAndCount();

    return { data, total };
  }

  /**
   * Obtener un gasto específico
   */
  async findOne(expenseId: number): Promise<Expense> {
    const expense = await this.expenseRepository.findOne({
      where: { id: expenseId },
    });

    if (!expense) {
      throw new NotFoundException(`Gasto con ID ${expenseId} no encontrado`);
    }

    return expense;
  }

  /**
   * Actualizar un gasto
   */
  async update(
    expenseId: number,
    dto: UpdateExpenseDto,
    userId?: number,
  ): Promise<Expense> {
    const expense = await this.findOne(expenseId);

    // Validar categoría si cambia
    if (dto.category && dto.category !== expense.category) {
      await this.validateCategory(dto.category);
    }

    // Validar que no se intente cambiar un gasto recurrente existente
    if (expense.is_recurring && !dto.is_recurring) {
      throw new BadRequestException(
        'No se puede desactivar la recurrencia de un gasto existente. Cree uno nuevo.',
      );
    }

    if (
      expense.payment_status !== ExpensePaymentStatusEnum.PENDING &&
      dto.payment_status === ExpensePaymentStatusEnum.PENDING
    ) {
      throw new BadRequestException(
        'No se puede volver un gasto pagado a pendiente sin reverso contable.',
      );
    }

    const shouldPostPayment =
      expense.payment_status === ExpensePaymentStatusEnum.PENDING &&
      expense.accounting_status === 'posted' &&
      (dto.payment_status === ExpensePaymentStatusEnum.PAID ||
        dto.payment_status === ExpensePaymentStatusEnum.REIMBURSED);
    const effectivePaymentStatus = dto.payment_status ?? expense.payment_status;

    const updated = this.expenseRepository.merge(expense, {
      ...dto,
      date: dto.date ? new Date(dto.date) : undefined,
      due_date: dto.due_date ? new Date(dto.due_date) : undefined,
      paid_date:
        shouldPostPayment || dto.paid_date
          ? this.buildPaidDate(
              effectivePaymentStatus,
              dto.paid_date,
              dto.date,
              expense.date,
            )
          : undefined,
      recurrence_start_date: dto.recurrence_start_date
        ? new Date(dto.recurrence_start_date)
        : undefined,
      recurrence_end_date: dto.recurrence_end_date
        ? new Date(dto.recurrence_end_date)
        : undefined,
      updated_by: userId,
    });

    const saved = await this.expenseRepository.save(updated);

    if (shouldPostPayment) {
      await this.enqueueExpenseAccounting(saved, userId, 'expense.paid');
    }

    this.logger.log(`Expense updated: ${expenseId}`);

    await this.auditLogsService.log({
      userId,
      action: AuditAction.UPDATED,
      entityType: 'expense',
      entityId: expenseId,
      newValues: { ...dto },
    });

    return saved;
  }

  async attachReceipt(
    expenseId: number,
    receiptUrl: string,
    userId?: number,
  ): Promise<Expense> {
    const expense = await this.findOne(expenseId);
    const updated = this.expenseRepository.merge(expense, {
      receipt_url: receiptUrl,
      updated_by: userId,
    });

    return this.expenseRepository.save(updated);
  }

  async registerExpensePayment(
    expenseId: number,
    dto: CreateExpensePaymentDto,
    userId?: number,
  ): Promise<Expense> {
    const expense = await runTenantTransaction(
      this.dataSource,
      async (runner) => {
        const lockedRows = (await runner.query(
          `
          SELECT *
          FROM expenses
          WHERE id = $1
          FOR UPDATE
        `,
          [expenseId],
        )) as Expense[];
        const current = lockedRows[0];

        if (!current) {
          throw new NotFoundException(
            `Gasto con ID ${expenseId} no encontrado`,
          );
        }

        const amount = this.toNumber(current.amount);
        const paidAmount = this.toNumber(current.paid_amount);
        const paymentAmount = this.toNumber(dto.amount);
        const remaining = Math.max(0, amount - paidAmount);

        if (paymentAmount <= 0) {
          throw new BadRequestException('El pago debe ser mayor a cero.');
        }

        if (paymentAmount > remaining) {
          throw new BadRequestException(
            'El pago no puede superar el saldo pendiente del gasto.',
          );
        }

        const newPaidAmount = new MoneyDecimal(paidAmount)
          .plus(paymentAmount)
          .toDecimalPlaces(2, MONEY_ROUNDING)
          .toNumber();
        const newStatus =
          newPaidAmount >= amount
            ? ExpensePaymentStatusEnum.PAID
            : ExpensePaymentStatusEnum.PARTIALLY_PAID;
        const paidDate =
          newStatus === ExpensePaymentStatusEnum.PAID ? dto.payment_date : null;

        const inserted = (await runner.query(
          `
          INSERT INTO expense_payments
            (expense_id, amount, currency, payment_date, payment_method,
             reference_number, notes, created_by)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          RETURNING id
        `,
          [
            current.id,
            paymentAmount,
            dto.currency ?? current.currency,
            dto.payment_date,
            dto.payment_method ?? null,
            dto.reference_number ?? null,
            dto.notes ?? null,
            userId ?? null,
          ],
        )) as ExpensePaymentInsertRow[];

        await runner.query(
          `
          UPDATE expenses
          SET paid_amount = $1,
              payment_status = $2,
              paid_date = COALESCE($3::date, paid_date),
              updated_by = $4,
              updated_at = NOW()
          WHERE id = $5
        `,
          [newPaidAmount, newStatus, paidDate, userId ?? null, current.id],
        );

        return {
          expense: {
            ...current,
            paid_amount: newPaidAmount,
            payment_status: newStatus,
            paid_date: paidDate ? new Date(paidDate) : current.paid_date,
          } as Expense,
          paymentId: inserted[0].id,
        };
      },
    );

    await this.enqueueExpenseAccounting(
      expense.expense,
      userId,
      'expense.payment.created',
      { expensePaymentId: expense.paymentId },
    );

    return this.findOne(expenseId);
  }

  /**
   * Eliminar un gasto
   */
  async remove(expenseId: number): Promise<void> {
    const expense = await this.findOne(expenseId);

    // Si es un gasto recurrente padre, eliminar también todas sus instancias generadas
    if (expense.is_recurring) {
      await this.expenseRepository.delete({
        recurring_expense_id: expenseId,
      });
    }

    await this.expenseRepository.delete(expenseId);

    this.logger.log(`Expense deleted: ${expenseId}`);
    await this.auditLogsService.log({
      action: AuditAction.DELETED,
      entityType: 'expense',
      entityId: expenseId,
    });
  }

  /**
   * Obtener resumen de gastos por período y propiedad
   * Genera un reporte que será usado para descontar automáticamente del P&L
   */
  async getSummary(
    propertyId: number,
    from?: string,
    to?: string,
  ): Promise<ExpenseSummary> {
    const query = this.expenseRepository.createQueryBuilder('e');

    query.where('e.property_id = :propertyId', { propertyId });

    if (from && to) {
      query.andWhere('e.date BETWEEN :from AND :to', {
        from: new Date(from),
        to: new Date(to),
      });
    }

    // Total de gastos
    const totalQuery = query.clone();
    const result = await totalQuery
      .select('SUM(e.amount)', 'total')
      .addSelect('SUM(COALESCE(e.paid_amount, 0))', 'paid_total')
      .addSelect(
        'SUM(GREATEST(e.amount - COALESCE(e.paid_amount, 0), 0))',
        'pending_balance',
      )
      .addSelect(
        'SUM(CASE WHEN e.affects_owner_statement THEN e.amount ELSE 0 END)',
        'owner_deductions',
      )
      .addSelect(
        'SUM(CASE WHEN e.is_reimbursable THEN e.amount ELSE 0 END)',
        'reimbursable_total',
      )
      .getRawOne<ExpenseSumRow>();

    // Gastos por categoría
    const byCategory = await query
      .clone()
      .select('e.category', 'category')
      .addSelect('SUM(e.amount)', 'total')
      .groupBy('e.category')
      .getRawMany<ExpenseCategorySummaryRow>();

    // Gastos por unidad (si aplica)
    const byUnit = await query
      .clone()
      .select('e.unit_id', 'unit_id')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.unit_id IS NOT NULL')
      .groupBy('e.unit_id')
      .getRawMany<ExpenseUnitSummaryRow>();

    // Contar gastos
    const countResult = await query.clone().getCount();

    return {
      total_expenses: result?.total || '0',
      paid_expenses: result?.paid_total || '0',
      pending_balance: result?.pending_balance || '0',
      owner_deductions: result?.owner_deductions || '0',
      reimbursable_total: result?.reimbursable_total || '0',
      by_category: byCategory.reduce(
        (acc, cat) => {
          acc[cat.category] = cat.total;
          return acc;
        },
        {} as Record<string, string>,
      ),
      expense_count: countResult,
      by_unit: byUnit.reduce(
        (acc, unit) => {
          acc[unit.unit_id || 'SIN_UNIDAD'] = unit.total;
          return acc;
        },
        {} as Record<string, string>,
      ),
    };
  }

  /**
   * Balance mensual (ingresos aprobados vs gastos) de los últimos 6 meses.
   * Opcionalmente filtrado por propiedad. Usado por el gráfico de contabilidad.
   */
  async getMonthlyBalance(
    propertyId?: number,
  ): Promise<Array<{ month: string; income: number; expenses: number }>> {
    const params: Array<number | string> = [];
    let incomeFilter = '';
    let expenseFilter = '';
    if (propertyId) {
      params.push(propertyId);
      incomeFilter = `AND property_id = $${params.length}`;
      expenseFilter = `AND property_id = $${params.length}`;
    }

    const rows = await this.dataSource.query<
      Array<{ month: string; income: string; expenses: string }>
    >(
      `
      WITH months AS (
        SELECT to_char(date_trunc('month', CURRENT_DATE) - (gs || ' month')::interval, 'YYYY-MM') AS month
        FROM generate_series(0, 5) AS gs
      ),
      inc AS (
        SELECT to_char(date_trunc('month', payment_date), 'YYYY-MM') AS month, SUM(amount) AS total
        FROM payments
        WHERE status::text = 'APPROVED' ${incomeFilter}
        GROUP BY 1
      ),
      exp AS (
        SELECT to_char(date_trunc('month', date), 'YYYY-MM') AS month, SUM(amount) AS total
        FROM expenses
        WHERE payment_status IN ('PAID', 'REIMBURSED') ${expenseFilter}
        GROUP BY 1
      )
      SELECT m.month,
             COALESCE(inc.total, 0) AS income,
             COALESCE(exp.total, 0) AS expenses
      FROM months m
      LEFT JOIN inc ON inc.month = m.month
      LEFT JOIN exp ON exp.month = m.month
      ORDER BY m.month ASC
      `,
      params,
    );

    return rows.map((r) => ({
      month: r.month,
      income: this.toNumber(r.income),
      expenses: this.toNumber(r.expenses),
    }));
  }

  private toNumber(value: string | number | null | undefined): number {
    const parsed = Number(value ?? 0);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  /**
   * Obtener resumen de gastos para múltiples propiedades
   */
  async getBulkSummary(
    propertyIds: number[],
    from?: string,
    to?: string,
  ): Promise<Record<number, ExpenseSummary>> {
    const summaries: Record<number, ExpenseSummary> = {};

    for (const propertyId of propertyIds) {
      summaries[propertyId] = await this.getSummary(propertyId, from, to);
    }

    return summaries;
  }

  /**
   * ========================================
   * INTERNAL LOGIC
   * ========================================
   */

  /**
   * Generar instancias futuras de un gasto recurrente
   * Genera gastos para los próximos 24 meses
   */
  private async generateRecurringExpenses(parent: Expense): Promise<void> {
    if (!parent.is_recurring || !parent.recurrence_interval) {
      return;
    }

    const expenses: Expense[] = [];
    let currentDate = new Date(parent.recurrence_start_date || parent.date);
    const endDate = parent.recurrence_end_date
      ? new Date(parent.recurrence_end_date)
      : new Date(new Date().setFullYear(new Date().getFullYear() + 2));

    while (currentDate < endDate) {
      const expense = this.expenseRepository.create({
        ...parent,
        id: undefined,
        date: new Date(currentDate),
        recurring_expense_id: parent.id,
        is_recurring: false, // Las instancias generadas no son recurrentes
        created_at: new Date(),
        updated_at: new Date(),
      });

      expenses.push(expense);

      // Calcular siguiente fecha según el intervalo
      currentDate = this.addInterval(currentDate, parent.recurrence_interval);
    }

    if (expenses.length > 0) {
      await this.expenseRepository.save(expenses);
      this.logger.log(
        `Generated ${expenses.length} recurring expense instances for parent ${parent.id}`,
      );
    }
  }

  /**
   * Agregar un intervalo a una fecha
   */
  private addInterval(date: Date, interval: string): Date {
    const newDate = new Date(date);

    switch (interval) {
      case 'DAILY':
        newDate.setDate(newDate.getDate() + 1);
        break;
      case 'WEEKLY':
        newDate.setDate(newDate.getDate() + 7);
        break;
      case 'MONTHLY':
        newDate.setMonth(newDate.getMonth() + 1);
        break;
      case 'QUARTERLY':
        newDate.setMonth(newDate.getMonth() + 3);
        break;
      case 'YEARLY':
        newDate.setFullYear(newDate.getFullYear() + 1);
        break;
    }

    return newDate;
  }

  private buildPaidDate(
    paymentStatus: string | undefined,
    paidDate: string | undefined,
    expenseDate: string | undefined,
    fallbackDate?: Date,
  ): Date | null {
    if (
      paymentStatus === ExpensePaymentStatusEnum.PENDING ||
      paymentStatus === ExpensePaymentStatusEnum.PARTIALLY_PAID
    ) {
      return null;
    }

    const value = paidDate ?? expenseDate;
    if (value) {
      return new Date(value);
    }

    return fallbackDate ?? new Date();
  }

  /**
   * Obtener el total de gastos para un período específico
   * Usado en cálculos de P&L
   */
  async getTotalExpensesByPeriod(
    propertyId: number,
    from: Date,
    to: Date,
  ): Promise<number> {
    const result = await this.expenseRepository
      .createQueryBuilder('e')
      .select('SUM(e.amount)', 'total')
      .where('e.property_id = :propertyId', { propertyId })
      .andWhere('e.date BETWEEN :from AND :to', { from, to })
      .getRawOne<ExpenseSumRow>();

    return parseFloat(result?.total ?? '0');
  }

  /**
   * Obtener el total de gastos por categoría
   * Usado en reportes detallados de P&L
   */
  async getExpensesByCategory(
    propertyId: number,
    from: Date,
    to: Date,
  ): Promise<Record<ExpenseCategoryEnum, number>> {
    const results = await this.expenseRepository
      .createQueryBuilder('e')
      .select('e.category', 'category')
      .addSelect('SUM(e.amount)', 'total')
      .where('e.property_id = :propertyId', { propertyId })
      .andWhere('e.date BETWEEN :from AND :to', { from, to })
      .groupBy('e.category')
      .getRawMany<ExpenseCategorySummaryRow>();

    return results.reduce(
      (acc, row) => {
        acc[row.category] = parseFloat(row.total);
        return acc;
      },
      {} as Record<string, number>,
    );
  }

  /**
   * Validar que la categoría sea una de las permitidas
   */
  private async validateCategory(category: string): Promise<void> {
    // 1. Check predefined enum
    const predefined = Object.values(ExpenseCategoryEnum) as string[];
    if (predefined.includes(category as ExpenseCategoryEnum)) {
      return;
    }

    // 2. Check tenant custom categories
    // Nota: Como search_path ya está seteado, consultamos tenant_config del schema actual
    const configResult = await this.dataSource.query<TenantExpenseConfigRow[]>(
      `SELECT custom_expense_categories FROM tenant_config LIMIT 1`,
    );

    const customCategories = configResult[0]?.custom_expense_categories ?? [];
    if (customCategories.includes(category)) {
      return;
    }

    throw new BadRequestException(
      `Categoría '${category}' no válida. Debe ser una de las predefinidas (${predefined.join(
        ', ',
      )}) o personalizadas (${customCategories.join(', ')})`,
    );
  }
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
