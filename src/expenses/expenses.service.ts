import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { Expense } from './entities/expense.entity';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto } from './dto';
import { ExpenseCategoryEnum } from './enums/expense-category.enum';

export interface ExpenseSummary {
  total_expenses: string;
  by_category: Record<string, string>;
  expense_count: number;
  by_unit?: Record<string, string>;
}

interface ExpenseSumRow {
  total: string | null;
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

@Injectable()
export class ExpensesService {
  private readonly logger = new Logger(ExpensesService.name);

  constructor(
    @InjectRepository(Expense)
    private readonly expenseRepository: Repository<Expense>,
    private readonly dataSource: DataSource,
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
        recurrence_start_date: dto.recurrence_start_date
          ? new Date(dto.recurrence_start_date)
          : null,
        recurrence_end_date: dto.recurrence_end_date
          ? new Date(dto.recurrence_end_date)
          : null,
        created_by: userId,
      });

      const saved = await this.expenseRepository.save(expense);

      // Si es un gasto recurrente, generar las instancias futuras
      if (dto.is_recurring && dto.recurrence_interval) {
        await this.generateRecurringExpenses(saved);
      }

      this.logger.log(`Expense created: ${saved.id}`);
      return saved;
    } catch (error: unknown) {
      this.logger.error(`Error creating expense: ${getErrorMessage(error)}`);
      throw new BadRequestException('Error al crear el gasto');
    }
  }

  /**
   * Obtener todos los gastos con filtros
   */
  async findAll(
    filters: ExpenseFiltersDto,
  ): Promise<{ data: Expense[]; total: number }> {
    const query = this.expenseRepository.createQueryBuilder('e');

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
        '(e.description ILIKE :search OR e.vendor_name ILIKE :search)',
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

    const updated = this.expenseRepository.merge(expense, {
      ...dto,
      date: dto.date ? new Date(dto.date) : undefined,
      recurrence_start_date: dto.recurrence_start_date
        ? new Date(dto.recurrence_start_date)
        : undefined,
      recurrence_end_date: dto.recurrence_end_date
        ? new Date(dto.recurrence_end_date)
        : undefined,
      updated_by: userId,
    });

    const saved = await this.expenseRepository.save(updated);

    this.logger.log(`Expense updated: ${expenseId}`);

    return saved;
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
