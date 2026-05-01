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
  UseInterceptors,
  UploadedFile,
  Request,
  Res,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import {
  CreatePaymentDto,
  CreatePaymentAsAdminDto,
  UpdatePaymentStatusDto,
  PaymentFiltersDto,
  CreateRefundDto,
  ApprovePaymentDto,
  RejectPaymentDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { receiptMulterConfig } from '../common/utils/multer.config';

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
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentAsAdminDto,
    @Request() req,
  ) {
    const adminId = req.user.userId;
    const schemaName = req.tenant?.schema_name || `tenant_${slug}`;
    return this.paymentsService.createPaymentAsAdmin(dto, adminId, schemaName);
  }

  /**
   * GET /:slug/admin/payments/export
   * Exportar pagos como CSV con los mismos filtros del listado
   */
  @Get('export')
  async exportCsv(@Query() filters: PaymentFiltersDto, @Res() res: Response) {
    const csv = await this.paymentsService.exportPaymentsCsv(filters);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pagos.csv"');
    res.send(csv);
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
   * PATCH /:slug/admin/payments/:id/approve
   * Aprobar un pago con comentario opcional.
   * Dispara el cálculo de split payment automáticamente.
   */
  @Patch(':id/approve')
  async approvePayment(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ApprovePaymentDto,
    @Request() req,
  ) {
    const adminId = req.user.userId;
    const schemaName = req.tenant?.schema_name || `tenant_${slug}`;
    return this.paymentsService.approvePayment(id, dto, adminId, schemaName);
  }

  /**
   * PATCH /:slug/admin/payments/:id/reject
   * Rechazar un pago con motivo obligatorio.
   * El inquilino verá el motivo en su portal.
   */
  @Patch(':id/reject')
  async rejectPayment(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RejectPaymentDto,
    @Request() req,
  ) {
    const adminId = req.user.userId;
    const schemaName = req.tenant?.schema_name || `tenant_${slug}`;
    return this.paymentsService.rejectPayment(id, dto, adminId, schemaName);
  }

  /**
   * PATCH /:slug/admin/payments/:id
   * Actualizar estado de un pago (genérico — mantener para compatibilidad)
   */
  @Patch(':id')
  async updatePaymentStatus(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdatePaymentStatusDto,
    @Request() req,
  ) {
    const adminId = req.user.userId;
    const schemaName = req.tenant?.schema_name || `tenant_${slug}`;
    return this.paymentsService.updatePaymentStatus(
      id,
      dto,
      adminId,
      schemaName,
    );
  }

  /**
   * DELETE /:slug/admin/payments/:id
   * Eliminar un pago
   */
  @Delete(':id')
  async deletePayment(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    const schemaName = req.tenant?.schema_name || `tenant_${slug}`;
    await this.paymentsService.deletePayment(id, schemaName);
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
    @Request() req,
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
   * GET /:slug/tenant/payments/methods
   * Métodos de pago disponibles según la configuración del tenant.
   * El frontend usa esto para construir el formulario de pago.
   */
  @Get('methods')
  async getPaymentMethods(@Param('slug') slug: string) {
    return this.paymentsService.getAvailablePaymentMethods(slug);
  }

  /**
   * POST /:slug/tenant/payments
   * Registrar un nuevo pago con comprobante opcional (multipart/form-data).
   * Campo file: "receipt" (imagen o PDF, máx 10 MB).
   */
  @Post()
  @UseInterceptors(FileInterceptor('receipt', receiptMulterConfig))
  async createPayment(
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentDto,
    @Request() req,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    const tenantId = req.user.userId;
    // Construir ruta relativa para almacenar en la DB
    const receiptPath = receipt
      ? `storage/receipts/${slug}/${receipt.filename}`
      : undefined;
    return this.paymentsService.createPayment(
      tenantId,
      dto,
      slug,
      undefined,
      undefined,
      receiptPath,
    );
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
