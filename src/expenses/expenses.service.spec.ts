import { Test } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { AccountingOutboxService } from '../accounting/accounting-outbox.service';
import { ExpensesService } from './expenses.service';
import { Expense } from './entities/expense.entity';
import { ExpenseCategoryEnum } from './enums/expense-category.enum';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto } from './dto';

type MockedExpenseRepository = jest.Mocked<
  Pick<
    Repository<Expense>,
    'create' | 'save' | 'findOne' | 'delete' | 'createQueryBuilder' | 'merge'
  >
>;

const makeDataSource = (queryImpl?: jest.Mock): Partial<DataSource> => ({
  query:
    queryImpl ??
    jest.fn().mockResolvedValue([{ custom_expense_categories: [] }]),
});

const makeMockRepository = (): MockedExpenseRepository => ({
  create: jest.fn(),
  save: jest.fn(),
  findOne: jest.fn(),
  delete: jest.fn(),
  createQueryBuilder: jest.fn(),
  merge: jest.fn(),
});

describe('ExpensesService', () => {
  let service: ExpensesService;
  let mockRepository: MockedExpenseRepository;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [
        ExpensesService,
        {
          provide: getRepositoryToken(Expense),
          useValue: makeMockRepository(),
        },
        {
          provide: DataSource,
          useValue: makeDataSource(),
        },
        {
          provide: AccountingOutboxService,
          useValue: {
            enqueue: jest.fn().mockResolvedValue(undefined),
          },
        },
      ],
    }).compile();

    service = module.get<ExpensesService>(ExpensesService);
    mockRepository = module.get<MockedExpenseRepository>(
      getRepositoryToken(Expense),
    );
  });

  describe('createExpense', () => {
    it('debe crear un gasto exitosamente', async () => {
      const createDto: CreateExpenseDto = {
        property_id: 1,
        category: ExpenseCategoryEnum.MAINTENANCE,
        amount: 150.5,
        date: '2024-04-15',
        currency: 'USD',
        description: 'Reparación de tubería',
      };

      const createdExpense: Expense = {
        id: 1,
        property_id: 1,
        unit_id: null,
        category: ExpenseCategoryEnum.MAINTENANCE,
        amount: 150.5,
        currency: 'USD',
        description: 'Reparación de tubería',
        date: new Date('2024-04-15'),
        vendor_id: null,
        vendor_name: null,
        receipt_url: null,
        is_recurring: false,
        recurrence_interval: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        recurring_expense_id: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: 1,
        updated_by: null,
      } as Expense;

      (mockRepository.create as jest.Mock).mockReturnValue(createdExpense);
      (mockRepository.save as jest.Mock).mockResolvedValue(createdExpense);

      const result = await service.createExpense(createDto, 1);

      expect(mockRepository.create).toHaveBeenCalledWith(
        expect.objectContaining({
          property_id: 1,
          category: ExpenseCategoryEnum.MAINTENANCE,
          amount: 150.5,
          created_by: 1,
        }),
      );
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(createdExpense);
    });

    it('debe descontar automáticamente en P&L', async () => {
      const propertyId = 1;
      const from = new Date('2024-01-01');
      const to = new Date('2024-01-31');

      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '1000.00' }),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const total = await service.getTotalExpensesByPeriod(
        propertyId,
        from,
        to,
      );

      expect(total).toBe(1000);
    });
  });

  describe('findAll', () => {
    it('debe retornar lista de gastos con total', async () => {
      const filters: ExpenseFiltersDto = {
        property_id: 1,
        page: 1,
        limit: 20,
      };

      const mockExpenses: Expense[] = [
        {
          id: 1,
          property_id: 1,
          category: ExpenseCategoryEnum.MAINTENANCE,
          amount: 150.5,
          date: new Date('2024-04-15'),
          currency: 'USD',
          unit_id: null,
          vendor_id: null,
          vendor_name: null,
          receipt_url: null,
          is_recurring: false,
          recurrence_interval: null,
          recurrence_start_date: null,
          recurrence_end_date: null,
          recurring_expense_id: null,
          description: null,
          notes: null,
          created_at: new Date(),
          updated_at: new Date(),
          created_by: null,
          updated_by: null,
        } as Expense,
      ];

      const mockQueryBuilder = {
        createQueryBuilder: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest
          .fn()
          .mockResolvedValue([mockExpenses, mockExpenses.length]),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.findAll(filters);

      expect(result.data).toEqual(mockExpenses);
      expect(result.total).toBe(1);
    });

    it('debe filtrar por categoría', async () => {
      const filters: ExpenseFiltersDto = {
        property_id: 1,
        category: ExpenseCategoryEnum.UTILITIES,
        page: 1,
        limit: 20,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'e.category = :category',
        { category: ExpenseCategoryEnum.UTILITIES },
      );
    });

    it('debe filtrar por período de fechas', async () => {
      const filters: ExpenseFiltersDto = {
        property_id: 1,
        from: '2024-01-01',
        to: '2024-01-31',
        page: 1,
        limit: 20,
      };

      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      await service.findAll(filters);

      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'e.date BETWEEN :from AND :to',
        expect.any(Object),
      );
    });
  });

  describe('findOne', () => {
    it('debe retornar un gasto si existe', async () => {
      const expense: Expense = {
        id: 1,
        property_id: 1,
        category: ExpenseCategoryEnum.MAINTENANCE,
        amount: 150.5,
        date: new Date('2024-04-15'),
        currency: 'USD',
        unit_id: null,
        vendor_id: null,
        vendor_name: null,
        receipt_url: null,
        is_recurring: false,
        recurrence_interval: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        recurring_expense_id: null,
        description: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
      } as Expense;

      (mockRepository.findOne as jest.Mock).mockResolvedValue(expense);

      const result = await service.findOne(1);

      expect(mockRepository.findOne).toHaveBeenCalledWith({
        where: { id: 1 },
      });
      expect(result).toEqual(expense);
    });

    it('debe lanzar NotFoundException si no existe', async () => {
      (mockRepository.findOne as jest.Mock).mockResolvedValue(null);

      await expect(service.findOne(999)).rejects.toThrow(NotFoundException);
    });
  });

  describe('update', () => {
    it('debe actualizar un gasto existente', async () => {
      const existingExpense: Expense = {
        id: 1,
        property_id: 1,
        category: ExpenseCategoryEnum.MAINTENANCE,
        amount: 150.5,
        date: new Date('2024-04-15'),
        currency: 'USD',
        unit_id: null,
        vendor_id: null,
        vendor_name: null,
        receipt_url: null,
        is_recurring: false,
        recurrence_interval: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        recurring_expense_id: null,
        description: 'Original',
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
      } as Expense;

      const updateDto: UpdateExpenseDto = {
        description: 'Actualizado',
      };

      const updatedExpense = { ...existingExpense, description: 'Actualizado' };

      (mockRepository.findOne as jest.Mock).mockResolvedValue(existingExpense);
      (mockRepository.merge as jest.Mock).mockReturnValue(updatedExpense);
      (mockRepository.save as jest.Mock).mockResolvedValue(updatedExpense);

      const result = await service.update(1, updateDto, 1);

      expect(mockRepository.merge).toHaveBeenCalled();
      expect(mockRepository.save).toHaveBeenCalled();
      expect(result).toEqual(updatedExpense);
    });
  });

  describe('remove', () => {
    it('debe eliminar un gasto', async () => {
      const expense: Expense = {
        id: 1,
        property_id: 1,
        category: ExpenseCategoryEnum.MAINTENANCE,
        amount: 150.5,
        date: new Date('2024-04-15'),
        currency: 'USD',
        unit_id: null,
        vendor_id: null,
        vendor_name: null,
        receipt_url: null,
        is_recurring: false,
        recurrence_interval: null,
        recurrence_start_date: null,
        recurrence_end_date: null,
        recurring_expense_id: null,
        description: null,
        notes: null,
        created_at: new Date(),
        updated_at: new Date(),
        created_by: null,
        updated_by: null,
      } as Expense;

      (mockRepository.findOne as jest.Mock).mockResolvedValue(expense);
      (mockRepository.delete as jest.Mock).mockResolvedValue({ affected: 1 });

      await service.remove(1);

      expect(mockRepository.delete).toHaveBeenCalledWith(1);
    });
  });

  describe('getSummary', () => {
    it('debe retornar resumen de gastos por categoría', async () => {
      const mockQueryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '500.00' }),
        getRawMany: jest.fn().mockResolvedValue([
          { category: ExpenseCategoryEnum.MAINTENANCE, total: '250.00' },
          { category: ExpenseCategoryEnum.UTILITIES, total: '250.00' },
        ]),
        getCount: jest.fn().mockResolvedValue(2),
        clone: jest.fn().mockReturnValue({
          select: jest.fn().mockReturnThis(),
          addSelect: jest.fn().mockReturnThis(),
          where: jest.fn().mockReturnThis(),
          andWhere: jest.fn().mockReturnThis(),
          groupBy: jest.fn().mockReturnThis(),
          getRawOne: jest.fn().mockResolvedValue({ total: '500.00' }),
          getRawMany: jest.fn().mockResolvedValue([
            { category: ExpenseCategoryEnum.MAINTENANCE, total: '250.00' },
            { category: ExpenseCategoryEnum.UTILITIES, total: '250.00' },
          ]),
          getCount: jest.fn().mockResolvedValue(2),
        }),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const result = await service.getSummary(1, '2024-01-01', '2024-01-31');

      expect(result).toHaveProperty('total_expenses');
      expect(result).toHaveProperty('by_category');
      expect(result).toHaveProperty('expense_count');
      expect(result.expense_count).toBe(2);
    });
  });

  describe('cálculo correcto de balance ingresos - gastos', () => {
    it('debe proporcionar métodos para calcular P&L = Ingresos - Gastos', () => {
      expect(typeof service.getTotalExpensesByPeriod).toBe('function');
      expect(typeof service.getExpensesByCategory).toBe('function');
      expect(typeof service.getSummary).toBe('function');
    });

    it('debe calcular total de gastos por período correctamente', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getRawOne: jest.fn().mockResolvedValue({ total: '1500.00' }),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const total = await service.getTotalExpensesByPeriod(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(total).toBe(1500);
    });

    it('debe desglosar gastos por categoría para análisis detallado', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        addSelect: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        groupBy: jest.fn().mockReturnThis(),
        getRawMany: jest.fn().mockResolvedValue([
          { category: ExpenseCategoryEnum.MAINTENANCE, total: '500.00' },
          { category: ExpenseCategoryEnum.UTILITIES, total: '300.00' },
          { category: ExpenseCategoryEnum.CLEANING, total: '200.00' },
        ]),
      };

      (mockRepository.createQueryBuilder as jest.Mock).mockReturnValue(
        mockQueryBuilder,
      );

      const expenses = await service.getExpensesByCategory(
        1,
        new Date('2024-01-01'),
        new Date('2024-01-31'),
      );

      expect(expenses[ExpenseCategoryEnum.MAINTENANCE]).toBe(500);
      expect(expenses[ExpenseCategoryEnum.UTILITIES]).toBe(300);
      expect(expenses[ExpenseCategoryEnum.CLEANING]).toBe(200);
    });
  });
});
