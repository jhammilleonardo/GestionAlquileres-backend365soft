import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Query,
  HttpCode,
  HttpStatus,
  BadRequestException,
  ParseIntPipe,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiBody,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
} from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import type { ExpenseSummary } from './expenses.service';
import { CreateExpenseDto, UpdateExpenseDto, ExpenseFiltersDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Expense } from './entities/expense.entity';
import {
  ExpenseResponseDto,
  ExpenseSummaryResponseDto,
  PaginatedExpensesResponseDto,
} from './dto/expense-response.dto';

interface JwtUser {
  userId: number;
  role: string;
  tenantSlug: string;
}

@ApiTags('Expenses - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller(':slug/admin/expenses')
export class AdminExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  @Post()
  @RequirePermission('expenses', 'create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Crear un nuevo gasto' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiBody({ type: CreateExpenseDto })
  @ApiCreatedResponse({ type: ExpenseResponseDto })
  async create(
    @Body() createExpenseDto: CreateExpenseDto,
    @CurrentUser() user: JwtUser,
  ): Promise<Expense> {
    return this.expensesService.createExpense(createExpenseDto, user.userId);
  }

  @Get()
  @RequirePermission('expenses', 'view')
  @ApiOperation({ summary: 'Listar gastos con filtros opcionales' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiOkResponse({ type: PaginatedExpensesResponseDto })
  async findAll(
    @Query() filters: ExpenseFiltersDto,
  ): Promise<{ data: Expense[]; total: number }> {
    return this.expensesService.findAll(filters);
  }

  @Get('summary')
  @RequirePermission('expenses', 'view')
  @ApiOperation({
    summary: 'Resumen de gastos por propiedad y período',
    description: 'Total agrupado por categoría — usado para cálculos de P&L',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'property_id', required: true })
  @ApiQuery({ name: 'from', required: false })
  @ApiQuery({ name: 'to', required: false })
  @ApiOkResponse({ type: ExpenseSummaryResponseDto })
  async getSummary(
    @Query('property_id') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
  ): Promise<ExpenseSummary> {
    if (!propertyId) {
      throw new BadRequestException('property_id es requerido');
    }
    return this.expensesService.getSummary(+propertyId, from, to);
  }

  @Get('monthly-balance')
  @RequirePermission('expenses', 'view')
  @ApiOperation({
    summary: 'Balance mensual (ingresos vs gastos) de los últimos 6 meses',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiQuery({ name: 'property_id', required: false })
  async getMonthlyBalance(
    @Query('property_id') propertyId?: string,
  ): Promise<Array<{ month: string; income: number; expenses: number }>> {
    return this.expensesService.getMonthlyBalance(propertyId ? +propertyId : undefined);
  }

  @Get(':id')
  @RequirePermission('expenses', 'view')
  @ApiOperation({ summary: 'Obtener gasto por ID' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: ExpenseResponseDto })
  @ApiNotFoundResponse({ description: 'Gasto no encontrado' })
  async findOne(@Param('id', ParseIntPipe) id: number): Promise<Expense> {
    return this.expensesService.findOne(id);
  }

  @Patch(':id')
  @RequirePermission('expenses', 'edit')
  @ApiOperation({ summary: 'Actualizar gasto' })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdateExpenseDto })
  @ApiOkResponse({ type: ExpenseResponseDto })
  @ApiNotFoundResponse({ description: 'Gasto no encontrado' })
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @CurrentUser() user: JwtUser,
  ): Promise<Expense> {
    return this.expensesService.update(id, updateExpenseDto, user.userId);
  }

  @Delete(':id')
  @RequirePermission('expenses', 'delete')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar gasto',
    description:
      'Si es recurrente, elimina también todas las instancias generadas.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug' })
  @ApiParam({ name: 'id', type: Number })
  @ApiNoContentResponse({ description: 'Gasto eliminado' })
  @ApiNotFoundResponse({ description: 'Gasto no encontrado' })
  async remove(@Param('id', ParseIntPipe) id: number): Promise<void> {
    return this.expensesService.remove(id);
  }
}
