import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Patch,
  Delete,
  UseGuards,
  Request,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiBearerAuth,
  ApiParam,
  ApiQuery,
  ApiResponse,
} from '@nestjs/swagger';
import { ExpensesService } from './expenses.service';
import {
  CreateExpenseDto,
  UpdateExpenseDto,
  ExpenseFiltersDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { Expense } from './entities/expense.entity';

@ApiTags('Expenses - Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/expenses')
export class AdminExpensesController {
  constructor(private readonly expensesService: ExpensesService) {}

  /**
   * Crear un nuevo gasto con comprobante opcional
   */
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    summary: 'Crear un nuevo gasto',
    description:
      'Registra un gasto con detalles opcionales de comprobante. Soporta gastos recurrentes.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiResponse({ status: 201, description: 'Gasto creado exitosamente' })
  async create(
    @Param('slug') slug: string,
    @Body() createExpenseDto: CreateExpenseDto,
    @Request() req: any,
  ): Promise<Expense> {
    return this.expensesService.createExpense(
      createExpenseDto,
      req.user.id,
    );
  }

  /**
   * Listar gastos con filtros
   */
  @Get()
  @ApiOperation({
    summary: 'Listar gastos',
    description:
      'Obtiene una lista de gastos filtrada por propiedad, categoría, período y otros criterios',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiResponse({ status: 200, description: 'Lista de gastos' })
  async findAll(
    @Param('slug') slug: string,
    @Query() filters: ExpenseFiltersDto,
    @Request() req: any,
  ): Promise<{ data: Expense[]; total: number }> {
    return this.expensesService.findAll(filters);
  }

  /**
   * Obtener resumen de gastos por propiedad y período
   */
  @Get('summary')
  @ApiOperation({
    summary: 'Obtener resumen de gastos',
    description:
      'Retorna el total de gastos agrupados por categoría para una propiedad en un período específico. Usado para cálculos de P&L',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiQuery({
    name: 'property_id',
    required: true,
    description: 'ID de la propiedad',
  })
  @ApiQuery({
    name: 'from',
    required: false,
    description: 'Fecha de inicio (ISO 8601)',
  })
  @ApiQuery({
    name: 'to',
    required: false,
    description: 'Fecha de fin (ISO 8601)',
  })
  @ApiResponse({ status: 200, description: 'Resumen de gastos' })
  async getSummary(
    @Param('slug') slug: string,
    @Query('property_id') propertyId: string,
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Request() req?: any,
  ): Promise<any> {
    if (!propertyId) {
      throw new Error('property_id es requerido');
    }

    return this.expensesService.getSummary(
      +propertyId,
      from,
      to,
    );
  }

  /**
   * Obtener un gasto específico
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener gasto por ID',
    description: 'Retorna los detalles de un gasto específico',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', description: 'ID del gasto', type: Number })
  @ApiResponse({ status: 200, description: 'Gasto encontrado' })
  @ApiResponse({ status: 404, description: 'Gasto no encontrado' })
  async findOne(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<Expense> {
    return this.expensesService.findOne(+id);
  }

  /**
   * Actualizar un gasto
   */
  @Patch(':id')
  @ApiOperation({
    summary: 'Actualizar gasto',
    description: 'Modifica los detalles de un gasto existente',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', description: 'ID del gasto', type: Number })
  @ApiResponse({ status: 200, description: 'Gasto actualizado' })
  async update(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Body() updateExpenseDto: UpdateExpenseDto,
    @Request() req: any,
  ): Promise<Expense> {
    return this.expensesService.update(
      +id,
      updateExpenseDto,
      req.user.id,
    );
  }

  /**
   * Eliminar un gasto
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Eliminar gasto',
    description:
      'Elimina un gasto. Si es recurrente, también elimina todas sus instancias generadas.',
  })
  @ApiParam({ name: 'slug', description: 'Tenant slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', description: 'ID del gasto', type: Number })
  @ApiResponse({ status: 204, description: 'Gasto eliminado' })
  @ApiResponse({ status: 404, description: 'Gasto no encontrado' })
  async remove(
    @Param('slug') slug: string,
    @Param('id') id: string,
    @Request() req: any,
  ): Promise<void> {
    return this.expensesService.remove(+id);
  }
}
