import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  ParseIntPipe,
  Query,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiExtraModels,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { OptionalPositiveIntPipe } from '../../common/pipes/optional-positive-int.pipe';
import { QrPaymentService } from './qr-payment.service';
import {
  GenerateQrDto,
  GenerateTenantQrDto,
  VerifyQrDto,
  QrCallbackDto,
  QrCallbackResponseDto,
  QrPaymentResponseDto,
  QrProviderStatusResponseDto,
} from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../../common/guards/permissions.guard';
import { RequirePermission } from '../../common/decorators/require-permission.decorator';

interface AuthenticatedTenantRequest {
  user: {
    userId: number;
  };
}

// ============================================================
// ADMIN – endpoints de gestión de QR
// ============================================================
@UseGuards(JwtAuthGuard, PermissionsGuard)
@ApiTags('QR Payments - Admin')
@ApiBearerAuth()
@ApiExtraModels(QrPaymentResponseDto, QrProviderStatusResponseDto)
@Controller(':slug/admin/qr-payments')
export class AdminQrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * POST /:slug/admin/qr-payments
   * Generar QR dinámico de pago para un inquilino
   */
  @Post()
  @RequirePermission('payments', 'create')
  @ApiOperation({
    summary: 'Generar QR dinámico como administrador',
    description:
      'Permite generar un QR para cualquier inquilino del tenant. Requiere tenant_id en el body.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: GenerateQrDto })
  @ApiCreatedResponse({ type: QrPaymentResponseDto })
  @ApiUnauthorizedResponse({ description: 'JWT inválido o ausente' })
  @ApiForbiddenResponse({ description: 'Rol distinto de ADMIN' })
  async generarQr(@Param('slug') slug: string, @Body() dto: GenerateQrDto) {
    // Admin puede generar QR para cualquier tenant — sin restricción de ownership
    return this.qrPaymentService.generarQrDinamico(slug, dto);
  }

  /**
   * POST /:slug/admin/qr-payments/verificar
   * Verificar el estado actual de un QR (consulta la API MC4)
   */
  @Post('verificar')
  @RequirePermission('payments', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar estado de QR como administrador',
    description:
      'Consulta el proveedor MC4/SIP y, si el QR está pagado, registra el pago de forma idempotente.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: VerifyQrDto })
  @ApiOkResponse({
    description:
      'QR actualizado o respuesta funcional del proveedor cuando no puede confirmar estado.',
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/QrPaymentResponseDto' },
        { $ref: '#/components/schemas/QrProviderStatusResponseDto' },
      ],
    },
  })
  @ApiBadRequestResponse({ description: 'Se requiere qr_id o alias' })
  async verificarEstado(@Param('slug') slug: string, @Body() dto: VerifyQrDto) {
    // Admin puede verificar cualquier QR — sin restricción de ownership (tenantId=undefined)
    return this.qrPaymentService.verificarEstadoQr(slug, dto, undefined);
  }

  /**
   * GET /:slug/admin/qr-payments
   * Listar todos los QRs del tenant (opcionalmente filtrados por inquilino)
   */
  @Get()
  @RequirePermission('payments', 'view')
  @ApiOperation({ summary: 'Listar QRs del tenant' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiQuery({
    name: 'tenant_id',
    required: false,
    type: Number,
    description: 'Filtra por inquilino específico.',
  })
  @ApiOkResponse({ type: QrPaymentResponseDto, isArray: true })
  async listarQrs(
    @Param('slug') slug: string,
    @Query('tenant_id', OptionalPositiveIntPipe) tenantId?: number,
  ) {
    return this.qrPaymentService.listarQrs(slug, tenantId);
  }

  /**
   * POST /:slug/admin/qr-payments/:id/cancelar
   * Cancelar un QR pendiente
   */
  @Post(':id/cancelar')
  @RequirePermission('payments', 'edit')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar QR pendiente como administrador' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: QrPaymentResponseDto })
  async cancelarQr(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
  ) {
    // Admin puede cancelar cualquier QR — sin restricción de ownership (tenantId=undefined)
    return this.qrPaymentService.cancelarQr(slug, id, undefined);
  }
}

// ============================================================
// TENANT – endpoints para el inquilino
// ============================================================
@UseGuards(JwtAuthGuard)
@ApiTags('QR Payments - Tenant')
@ApiBearerAuth()
@ApiExtraModels(QrPaymentResponseDto, QrProviderStatusResponseDto)
@Controller(':slug/tenant/qr-payments')
export class TenantQrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * POST /:slug/tenant/qr-payments
   * El inquilino solicita un QR de pago para su alquiler
   */
  @Post()
  @ApiOperation({
    summary: 'Generar QR para el inquilino autenticado',
    description:
      'El backend toma tenant_id desde el JWT; el frontend no debe enviarlo.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: GenerateTenantQrDto })
  @ApiCreatedResponse({ type: QrPaymentResponseDto })
  @ApiForbiddenResponse({
    description: 'El contrato no pertenece al inquilino',
  })
  async generarQr(
    @Param('slug') slug: string,
    @Body() dto: GenerateTenantQrDto,
    @Request() req: AuthenticatedTenantRequest,
  ) {
    const tenant_id: number = req.user.userId;
    return this.qrPaymentService.generarQrDinamico(slug, {
      ...dto,
      tenant_id,
    });
  }

  /**
   * POST /:slug/tenant/qr-payments/verificar
   * El inquilino verifica el estado de su QR.
   * Solo puede verificar QRs que le pertenecen.
   */
  @Post('verificar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Verificar estado de QR propio',
    description:
      'Solo permite verificar QRs que pertenecen al inquilino autenticado.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiBody({ type: VerifyQrDto })
  @ApiOkResponse({
    description: 'QR actualizado o respuesta funcional del proveedor.',
    schema: {
      oneOf: [
        { $ref: '#/components/schemas/QrPaymentResponseDto' },
        { $ref: '#/components/schemas/QrProviderStatusResponseDto' },
      ],
    },
  })
  @ApiBadRequestResponse({ description: 'Se requiere qr_id o alias' })
  @ApiForbiddenResponse({ description: 'El QR no pertenece al inquilino' })
  async verificarEstado(
    @Param('slug') slug: string,
    @Body() dto: VerifyQrDto,
    @Request() req: AuthenticatedTenantRequest,
  ) {
    const tenantId: number = req.user.userId;
    return this.qrPaymentService.verificarEstadoQr(slug, dto, tenantId);
  }

  /**
   * GET /:slug/tenant/qr-payments
   * El inquilino ve sus QRs generados
   */
  @Get()
  @ApiOperation({ summary: 'Listar QRs del inquilino autenticado' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiOkResponse({ type: QrPaymentResponseDto, isArray: true })
  async listarMisQrs(
    @Param('slug') slug: string,
    @Request() req: AuthenticatedTenantRequest,
  ) {
    const tenantId: number = req.user.userId;
    return this.qrPaymentService.listarMisQrs(slug, tenantId);
  }

  /**
   * POST /:slug/tenant/qr-payments/:id/cancelar
   * El inquilino cancela un QR pendiente propio.
   * Solo puede cancelar QRs que le pertenecen.
   */
  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Cancelar QR pendiente propio' })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiParam({ name: 'id', type: Number })
  @ApiOkResponse({ type: QrPaymentResponseDto })
  @ApiForbiddenResponse({ description: 'El QR no pertenece al inquilino' })
  async cancelarQr(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedTenantRequest,
  ) {
    const tenantId: number = req.user.userId;
    return this.qrPaymentService.cancelarQr(slug, id, tenantId);
  }
}

// ============================================================
// PÚBLICO – callback del banco MC4/SIP (sin autenticación JWT)
// ============================================================
@ApiTags('QR Payments - Public Callback')
@Controller(':slug/qr-payments')
export class PublicQrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * POST /:slug/qr-payments/callback?token=<MC4_CALLBACK_SECRET>
   * Webhook llamado por MC4/SIP al confirmar un pago.
   *
   * Seguridad en capas:
   *  1. Token secreto en query param (registrar la URL completa en el panel MC4)
   *  2. Comparación en tiempo constante (previene timing attacks)
   *  3. Rate limiting estricto (máx 30 req/min desde cualquier IP)
   *  4. Validación de alias y monto se hace en el service
   *
   * URL a registrar en MC4:
   *   https://tu-servidor.com/:slug/qr-payments/callback?token=<MC4_CALLBACK_SECRET>
   */
  @Post('callback')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @ApiOperation({
    summary: 'Callback público del proveedor MC4/SIP',
    description:
      'Endpoint sin JWT protegido por token compartido en query param y validaciones de alias/monto.',
  })
  @ApiParam({ name: 'slug', example: 'mi-empresa' })
  @ApiQuery({
    name: 'token',
    required: true,
    description: 'MC4_CALLBACK_SECRET registrado con el proveedor.',
  })
  @ApiBody({ type: QrCallbackDto })
  @ApiOkResponse({ type: QrCallbackResponseDto })
  @ApiUnauthorizedResponse({ description: 'Token inválido o ausente' })
  @ApiTooManyRequestsResponse({
    description: 'Rate limit del callback excedido',
  })
  async handleCallback(
    @Param('slug') slug: string,
    @Body() dto: QrCallbackDto,
    @Query('token') token: string,
  ) {
    const expectedSecret = process.env.MC4_CALLBACK_SECRET ?? '';

    // Capa 1 + 2: verificar token con comparación en tiempo constante
    // timingSafeEqual previene ataques de timing que permiten adivinar el secreto bit a bit
    const { timingSafeEqual } = await import('crypto');
    const tokenBuf = Buffer.from(token ?? '');
    const expectedBuf = Buffer.from(expectedSecret);
    const isValid =
      expectedSecret.length >= 16 &&
      tokenBuf.length === expectedBuf.length &&
      timingSafeEqual(tokenBuf, expectedBuf);

    if (!isValid) {
      // Respuesta genérica — no revelar si el token es incorrecto o falta
      throw new UnauthorizedException('No autorizado');
    }

    return this.qrPaymentService.handleCallback(slug, dto);
  }
}
