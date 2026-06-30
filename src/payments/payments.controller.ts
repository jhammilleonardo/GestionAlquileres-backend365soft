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
import { Throttle } from '@nestjs/throttler';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiProduces,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { Response } from 'express';
import { PaymentsService } from './payments.service';
import { PaymentLedgerService } from './payment-ledger.service';
import { ReservationPaymentService } from './reservation-payment.service';
import {
  CreatePaymentDto,
  CreatePaymentAsAdminDto,
  CreateReservationPaymentDto,
  UpdatePaymentStatusDto,
  PaymentFiltersDto,
  CreateRefundDto,
  ApprovePaymentDto,
  RejectPaymentDto,
  PaginatedPaymentsResponseDto,
  PaymentMessageResponseDto,
  PaymentMethodOptionDto,
  PaymentResponseDto,
  PaymentStatsResponseDto,
} from './dto';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/guards/permissions.guard';
import { RequirePermission } from '../common/decorators/require-permission.decorator';
import { receiptMulterConfig } from '../common/utils/multer.config';
import { assertUploadedFilesMatchContent } from '../common/utils/upload-content-validation';
import { StorageService } from '../common/storage/storage.service';
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

@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('Payments - Admin')
@ApiBearerAuth()
@Controller(':slug/admin/payments')
export class AdminPaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly paymentLedgerService: PaymentLedgerService,
  ) {}

  /**
   * GET /:slug/admin/payments
   * Listar todos los pagos con filtros
   */
  @Get()
  @RequirePermission('payments', 'view')
  @ApiOperation({
    summary: 'Listar pagos del tenant con filtros',
    description:
      'Listado paginado para administración. Usa schema tenant-aware desde la request.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: PaginatedPaymentsResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  @ApiForbiddenResponse({ description: 'Rol distinto de ADMIN' })
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
  @RequirePermission('payments', 'view')
  @ApiOperation({ summary: 'Obtener estadísticas agregadas de pagos' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: PaymentStatsResponseDto })
  async getStats(@Param('slug') slug: string, @Request() req: TenantRequest) {
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentsService.getAdminStats(schemaName);
  }

  @Get('ledger')
  @RequirePermission('payments', 'view')
  @ApiOperation({
    summary: 'Ledger financiero admin para largo y corto plazo',
    description:
      'Consolida contratos de largo plazo, reservas de corto plazo, deuda, mora, saldos y alertas financieras.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ description: 'Ledger financiero consolidado' })
  async getLedger(@Param('slug') slug: string, @Request() req: TenantRequest) {
    const schemaName = getTenantSchemaName(req, slug);
    return this.paymentLedgerService.getAdminLedger(schemaName);
  }

  /**
   * POST /:slug/admin/payments
   * Crear un nuevo pago como admin
   */
  @Post()
  @RequirePermission('payments', 'create')
  @ApiOperation({
    summary: 'Crear pago manual como administrador',
    description:
      'Permite registrar pagos para cualquier inquilino/contrato/propiedad del tenant.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: CreatePaymentAsAdminDto })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o transición no permitida',
  })
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
  @RequirePermission('payments', 'view')
  @ApiOperation({
    summary: 'Exportar pagos a CSV',
    description: 'Usa los mismos filtros permitidos por el listado admin.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiProduces('text/csv')
  @ApiOkResponse({
    description: 'Archivo CSV con pagos filtrados',
    content: {
      'text/csv': {
        schema: {
          type: 'string',
          example:
            'ID,Monto,Moneda,Tipo,Método,Estado,Fecha Pago,Fecha Vencimiento,Referencia,Notas,Creado,Inquilino,Email Inquilino,Propiedad,Contrato',
        },
      },
    },
  })
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
  @RequirePermission('payments', 'view')
  @ApiOperation({ summary: 'Obtener detalle de pago por ID' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
  @RequirePermission('payments', 'edit')
  @ApiOperation({
    summary: 'Aprobar pago',
    description:
      'Aprueba el pago y ejecuta split payment en la misma transacción. Si el split falla, la aprobación se revierte.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: ApprovePaymentDto })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({ description: 'Transición de estado inválida' })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
  @RequirePermission('payments', 'edit')
  @ApiOperation({
    summary: 'Rechazar pago',
    description: 'El motivo de rechazo queda visible para el inquilino.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: RejectPaymentDto })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({
    description: 'Motivo faltante o transición inválida',
  })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
  @RequirePermission('payments', 'edit')
  @ApiOperation({
    summary: 'Actualizar estado de pago',
    description:
      'Endpoint genérico mantenido por compatibilidad. Preferir /approve y /reject para esos flujos.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: UpdatePaymentStatusDto })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({ description: 'Transición de estado inválida' })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
  @RequirePermission('payments', 'delete')
  @ApiOperation({
    summary: 'Eliminar pago',
    description:
      'Solo permite eliminar pagos que no estén aprobados ni en procesamiento.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PaymentMessageResponseDto })
  @ApiBadRequestResponse({
    description: 'No se puede eliminar un pago aprobado o en procesamiento',
  })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
  @RequirePermission('payments', 'edit')
  @ApiOperation({
    summary: 'Crear reembolso de pago',
    description:
      'Valida monto acumulado reembolsado y bloquea el pago durante la operación.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiBody({ type: CreateRefundDto })
  @ApiCreatedResponse({ type: PaymentMessageResponseDto })
  @ApiBadRequestResponse({
    description: 'Monto inválido o pago no reembolsable',
  })
  @ApiNotFoundResponse({ description: 'Pago no encontrado' })
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
@ApiTags('Payments - Tenant')
@ApiBearerAuth()
@Controller(':slug/tenant/payments')
export class TenantPaymentsController {
  constructor(
    private readonly paymentsService: PaymentsService,
    private readonly storageService: StorageService,
  ) {}

  /**
   * GET /:slug/tenant/payments/methods
   * Métodos de pago disponibles según la configuración del tenant.
   * El frontend usa esto para construir el formulario de pago.
   */
  @Get('methods')
  @ApiOperation({
    summary: 'Listar métodos de pago disponibles para el tenant',
    description:
      'El frontend usa este endpoint para construir el formulario de pagos del inquilino.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: PaymentMethodOptionDto, isArray: true })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  async getPaymentMethods(@Param('slug') slug: string) {
    return this.paymentsService.getAvailablePaymentMethods(slug);
  }

  /**
   * POST /:slug/tenant/payments
   * Registrar un nuevo pago con comprobante opcional (multipart/form-data).
   * Campo file: "receipt" (imagen o PDF, máx 10 MB).
   */
  @Post()
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @UseInterceptors(FileInterceptor('receipt', receiptMulterConfig))
  @ApiOperation({
    summary: 'Registrar pago del inquilino',
    description:
      'Registra un pago propio con comprobante opcional. El tenant_id se toma del JWT.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['amount', 'payment_type', 'payment_method', 'payment_date'],
      properties: {
        amount: { type: 'number', example: 1250.5 },
        currency: { type: 'string', example: 'BOB' },
        payment_type: { type: 'string', example: 'RENT' },
        payment_method: { type: 'string', example: 'TRANSFER' },
        payment_date: { type: 'string', format: 'date', example: '2026-05-20' },
        due_date: { type: 'string', format: 'date', example: '2026-05-25' },
        reference_number: { type: 'string', example: 'TRX-123456' },
        check_number: { type: 'string', example: '000123' },
        notes: { type: 'string', example: 'Pago alquiler mayo 2026' },
        payment_processor: { type: 'string', example: 'manual' },
        is_partial_payment: { type: 'boolean', example: false },
        parent_payment_id: { type: 'number', example: 31 },
        is_recurring: { type: 'boolean', example: false },
        recurring_schedule_id: { type: 'number', example: 2 },
        receipt: {
          type: 'string',
          format: 'binary',
          description: 'Comprobante opcional. Campo multipart: receipt.',
        },
      },
    },
  })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({
    description: 'Datos inválidos o contrato no resuelto',
  })
  async createPayment(
    @Param('slug') slug: string,
    @Body() dto: CreatePaymentDto,
    @Request() req: TenantRequest,
    @UploadedFile() receipt?: Express.Multer.File,
  ) {
    const tenantId = getRequestUserId(req);
    await assertUploadedFilesMatchContent(receipt);
    // Construir ruta relativa para almacenar en la DB
    const receiptPath = receipt
      ? await this.storageService.persistUploadedFile(
          receipt,
          this.storageService.buildStoragePath(
            'receipts',
            slug,
            receipt.filename,
          ),
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
  @ApiOperation({ summary: 'Listar pagos del inquilino autenticado' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: PaymentResponseDto, isArray: true })
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
  @ApiOperation({ summary: 'Obtener estadísticas de pagos del inquilino' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: PaymentStatsResponseDto })
  async getMyStats(@Param('slug') slug: string, @Request() req: TenantRequest) {
    const tenantId = getRequestUserId(req);
    return this.paymentsService.getTenantStats(tenantId, slug);
  }

  /**
   * GET /:slug/tenant/payments/:id
   * Obtener un pago específico (solo si es mío)
   */
  @Get(':id')
  @ApiOperation({
    summary: 'Obtener pago propio por ID',
    description:
      'Devuelve 404 si el pago existe pero pertenece a otro inquilino.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: PaymentResponseDto })
  @ApiNotFoundResponse({ description: 'Pago no encontrado para el inquilino' })
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

// ===========================================
// TENANT — RESERVATION PAYMENTS (short-term)
// ===========================================

@UseGuards(JwtAuthGuard)
@ApiTags('Payments - Reservation')
@ApiBearerAuth()
@Controller(':slug/tenant/reservations/:reservationId/payments')
export class TenantReservationPaymentsController {
  constructor(
    private readonly reservationPaymentService: ReservationPaymentService,
  ) {}

  /**
   * POST /:slug/tenant/reservations/:reservationId/payments
   * Registra un pago contra una reserva de corto plazo propia. Queda en estado
   * PENDING y recorre el mismo flujo de aprobación/posteo que el resto de pagos.
   */
  @Post()
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  @ApiOperation({
    summary: 'Registrar pago de una reserva de corto plazo',
    description:
      'El pago se vincula a la reserva (reservation_id), no a un contrato. Queda PENDING para aprobación del admin.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'reservationId', type: Number })
  @ApiCreatedResponse({ type: PaymentResponseDto })
  @ApiBadRequestResponse({
    description: 'Reserva no pagable o monto excede el saldo pendiente',
  })
  @ApiNotFoundResponse({
    description: 'Reserva no encontrada para el inquilino',
  })
  async createReservationPayment(
    @Param('slug') slug: string,
    @Param('reservationId', ParseIntPipe) reservationId: number,
    @Body() dto: CreateReservationPaymentDto,
    @Request() req: TenantRequest,
  ) {
    const tenantId = getRequestUserId(req);
    const schemaName = getTenantSchemaName(req, slug);
    return this.reservationPaymentService.createReservationPayment(
      schemaName,
      reservationId,
      tenantId,
      dto,
      slug,
    );
  }
}
