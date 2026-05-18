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
  UnauthorizedException,
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
import { storageService } from '../common/storage/storage.service';
import type { TenantRequest } from '../common/middleware/tenant-context.middleware';

function getTenantSchemaName(req: TenantRequest, slug: string): string {
  return req.tenant?.schema_name ?? `tenant_${slug}`;
}

function getRequestUserId(req: TenantRequest): number {
  if (!req.user) {
    throw new UnauthorizedException('Usuario no autenticado');
  }
  return req.user.userId;
}

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
  async getAllPayments(
    @Param('slug') slug: string,
    @Query() filters: PaymentFiltersDto,
    @Request() req: TenantRequest,
  ) {
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.getAllPayments(filters, schemaName);
  }

  /**
   * GET /:slug/admin/payments/stats
   * Obtener estadísticas generales
   */
  @Get('stats')
  async getStats(@Param('slug') slug: string, @Request() req: TenantRequest) {
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.getAdminStats(schemaName);
  }

  /**
   * POST /:slug/admin/payments
   * Crear un nuevo pago como admin
   */
  @Post()
  async createPaymentAsAdmin(
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentAsAdminDto,
    @Request() req: TenantRequest,
  ) {
    const adminId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.createPaymentAsAdmin(dto, adminId, schemaName);
  }

  /**
   * GET /:slug/admin/payments/export
   * Exportar pagos como CSV con los mismos filtros del listado
   */
  @Get('export')
  async exportCsv(
    @Param('slug') slug: string,
    @Query() filters: PaymentFiltersDto,
    @Res() res: Response,
    @Request() req: TenantRequest,
  ) {
    const schemaName = getTenantSchemaName(req, slug);
    const csv = await this.paymentsService.exportPaymentsCsv(
      filters,
      schemaName,
    );
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="pagos.csv"');
    res.send(csv);
  }

  /**
   * GET /:slug/admin/payments/:id
   * Obtener un pago por ID
   */
  @Get(':id')
  async getPaymentById(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.getPaymentById(id, undefined, schemaName);
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
    @Request() req: TenantRequest,
  ) {
    const adminId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
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
    @Request() req: TenantRequest,
  ) {
    const adminId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
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
    @Request() req: TenantRequest,
  ) {
    const adminId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
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
    @Request() req: TenantRequest,
  ) {
    const schemaName = getTenantSchemaName(req, slug);
    await this.paymentsService.deletePayment(id, schemaName);
    return { message: 'Pago eliminado exitosamente' };
  }

  /**
   * POST /:slug/admin/payments/:id/refund
   * Crear un reembolso
   */
  @Post(':id/refund')
  async createRefund(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateRefundDto,
    @Request() req: TenantRequest,
  ) {
    const adminId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
    await this.paymentsService.createRefund(id, dto, adminId, schemaName);
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
    @Request() req: TenantRequest,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    const tenantId = getRequestUserId(req);
    // Construir ruta relativa para almacenar en la DB
    const receiptPath = receipt
      ? await storageService.persistUploadedFile(
          receipt,
          storageService.buildStoragePath('receipts', slug, receipt.filename),
          'private',
        )
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
  async getMyPayments(
    @Param('slug') slug: string,
    @Request() req: TenantRequest,
  ) {
    const tenantId = getRequestUserId(req);
    return this.paymentsService.getTenantPayments(tenantId, slug);
  }

  /**
   * GET /:slug/tenant/payments/stats
   * Obtener mis estadísticas
   */
  @Get('stats')
  async getMyStats(@Param('slug') slug: string, @Request() req: TenantRequest) {
    const tenantId = getRequestUserId(req);
    return this.paymentsService.getTenantStats(tenantId, slug);
  }

  /**
   * GET /:slug/tenant/payments/:id
   * Obtener un pago específico (solo si es mío)
   */
  @Get(':id')
  async getPaymentById(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: TenantRequest,
  ) {
    const tenantId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.getPaymentById(id, tenantId, schemaName);
  }
}
