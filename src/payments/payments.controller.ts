import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  ParseIntPipe,
  UseGuards,
  Request
} from '@nestjs/common';
import { PaymentsService } from './payments.service';
import { CreatePaymentDto, CreatePaymentAsAdminDto, UpdatePaymentStatusDto, PaymentFiltersDto, CreateRefundDto } from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';

/**
 * Payments Controller
 *
 * Maneja todos los endpoints relacionados con pagos.
 * Incluye endpoints para admin y tenant.
 */

// ===========================================
// ADMIN ENDPOINTS
// ===========================================

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/payments')
export class AdminPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * GET /:slug/admin/payments
   * Listar todos los pagos con filtros
   */
  @Get()
  async getAllPayments(@Query() filters: PaymentFiltersDto) {
    return this.paymentsService.getAllPayments(filters);
  }

  /**
   * GET /:slug/admin/payments/stats
   * Obtener estadísticas generales
   */
  @Get('stats')
  async getStats() {
    return this.paymentsService.getAdminStats();
  }

  /**
   * POST /:slug/admin/payments
   * Crear un nuevo pago como admin
   */
  @Post()
  async createPaymentAsAdmin(
    @Body() dto: CreatePaymentAsAdminDto,
    @Request() req
  ) {
    const adminId = req.user.userId;
    return this.paymentsService.createPaymentAsAdmin(dto, adminId);
  }

  /**
   * GET /:slug/admin/payments/:id
   * Obtener un pago por ID
   */
  @Get(':id')
  async getPaymentById(@Param('id', ParseIntPipe) id: number) {
    return this.paymentsService.getPaymentById(id);
  }

  /**
   * PATCH /:slug/admin/payments/:id
   * Actualizar estado de un pago (aprobar/rechazar)
   */
  @Patch(':id')
  async updatePaymentStatus(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
    @Request() req
  ) {
    // Obtener adminId del usuario autenticado
    const adminId = req.user.userId;
    return this.paymentsService.updatePaymentStatus(id, dto, adminId);
  }

  /**
   * DELETE /:slug/admin/payments/:id
   * Eliminar un pago
   */
  @Delete(':id')
  async deletePayment(@Param('id', ParseIntPipe) id: number) {
    await this.paymentsService.deletePayment(id);
    return { message: 'Pago eliminado exitosamente' };
  }

  /**
   * POST /:slug/admin/payments/:id/refund
   * Crear un reembolso
   */
  @Post(':id/refund')
  async createRefund(
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRefundDto,
    @Request() req
  ) {
    const adminId = req.user.userId;
    await this.paymentsService.createRefund(id, dto, adminId);
    return { message: 'Reembolso creado exitosamente' };
  }
}

// ===========================================
// TENANT ENDPOINTS
// ===========================================

@UseGuards(JwtAuthGuard)
@Controller(':slug/tenant/payments')
export class TenantPaymentsController {
  constructor(private readonly paymentsService: PaymentsService) {}

  /**
   * POST /:slug/tenant/payments
   * Crear un nuevo pago
   */
  @Post()
  async createPayment(
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentDto,
    @Request() req
  ) {
    // Obtener tenantId del usuario autenticado
    const tenantId = req.user.userId;
    return this.paymentsService.createPayment(tenantId, dto, slug);
  }

  /**
   * GET /:slug/tenant/payments
   * Obtener mis pagos
   */
  @Get()
  async getMyPayments(@Param('slug') slug: string, @Request() req) {
    const tenantId = req.user.userId;
    return this.paymentsService.getTenantPayments(tenantId, slug);
  }

  /**
   * GET /:slug/tenant/payments/stats
   * Obtener mis estadísticas
   */
  @Get('stats')
  async getMyStats(@Param('slug') slug: string, @Request() req) {
    const tenantId = req.user.userId;
    return this.paymentsService.getTenantStats(tenantId, slug);
  }

  /**
   * GET /:slug/tenant/payments/:id
   * Obtener un pago específico (solo si es mío)
   */
  @Get(':id')
  async getPaymentById(@Param('id', ParseIntPipe) id: number, @Request() req) {
    const tenantId = req.user.userId;
    return this.paymentsService.getPaymentById(id, tenantId);
  }
}
