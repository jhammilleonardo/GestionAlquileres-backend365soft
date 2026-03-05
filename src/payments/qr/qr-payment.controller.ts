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
import { Throttle } from '@nestjs/throttler';
import { QrPaymentService } from './qr-payment.service';
import { GenerateQrDto, VerifyQrDto, QrCallbackDto } from './dto';
import { JwtAuthGuard } from '../../common/guards/jwt-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { Roles } from '../../common/decorators/roles.decorator';

// ============================================================
// ADMIN – endpoints de gestión de QR
// ============================================================
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
@Controller(':slug/admin/qr-payments')
export class AdminQrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * POST /:slug/admin/qr-payments
   * Generar QR dinámico de pago para un inquilino
   */
  @Post()
  async generarQr(
    @Param('slug') slug: string,
    @Body() dto: GenerateQrDto,
  ) {
    // Admin puede generar QR para cualquier tenant — sin restricción de ownership
    return this.qrPaymentService.generarQrDinamico(slug, dto);
  }

  /**
   * POST /:slug/admin/qr-payments/verificar
   * Verificar el estado actual de un QR (consulta la API MC4)
   */
  @Post('verificar')
  @HttpCode(HttpStatus.OK)
  async verificarEstado(
    @Param('slug') slug: string,
    @Body() dto: VerifyQrDto,
  ) {
    // Admin puede verificar cualquier QR — sin restricción de ownership (tenantId=undefined)
    return this.qrPaymentService.verificarEstadoQr(slug, dto, undefined);
  }

  /**
   * GET /:slug/admin/qr-payments
   * Listar todos los QRs del tenant (opcionalmente filtrados por inquilino)
   */
  @Get()
  async listarQrs(
    @Param('slug') slug: string,
    @Query('tenant_id') tenantId?: string,
  ) {
    return this.qrPaymentService.listarQrs(
      slug,
      tenantId ? parseInt(tenantId, 10) : undefined,
    );
  }

  /**
   * POST /:slug/admin/qr-payments/:id/cancelar
   * Cancelar un QR pendiente
   */
  @Post(':id/cancelar')
  @HttpCode(HttpStatus.OK)
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
@Controller(':slug/tenant/qr-payments')
export class TenantQrPaymentController {
  constructor(private readonly qrPaymentService: QrPaymentService) {}

  /**
   * POST /:slug/tenant/qr-payments
   * El inquilino solicita un QR de pago para su alquiler
   */
  @Post()
  async generarQr(
    @Param('slug') slug: string,
    @Body() dto: Omit<GenerateQrDto, 'tenant_id'>,
    @Request() req,
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
  async verificarEstado(
    @Param('slug') slug: string,
    @Body() dto: VerifyQrDto,
    @Request() req,
  ) {
    const tenantId: number = req.user.userId;
    return this.qrPaymentService.verificarEstadoQr(slug, dto, tenantId);
  }

  /**
   * GET /:slug/tenant/qr-payments
   * El inquilino ve sus QRs generados
   */
  @Get()
  async listarMisQrs(@Param('slug') slug: string, @Request() req) {
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
  async cancelarQr(
    @Param('slug') slug: string,
    @Param('id', ParseIntPipe) id: number,
    @Request() req,
  ) {
    const tenantId: number = req.user.userId;
    return this.qrPaymentService.cancelarQr(slug, id, tenantId);
  }
}

// ============================================================
// PÚBLICO – callback del banco MC4/SIP (sin autenticación JWT)
// ============================================================
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
  async handleCallback(
    @Param('slug') slug: string,
    @Body() dto: QrCallbackDto,
    @Query('token') token: string,
  ) {
    const expectedSecret = process.env.MC4_CALLBACK_SECRET ?? '';

    // Capa 1 + 2: verificar token con comparación en tiempo constante
    // timingSafeEqual previene ataques de timing que permiten adivinar el secreto bit a bit
    const { timingSafeEqual } = await import('crypto');
    const tokenBuf    = Buffer.from(token ?? '');
    const expectedBuf = Buffer.from(expectedSecret);
    const isValid = tokenBuf.length === expectedBuf.length
      && timingSafeEqual(tokenBuf, expectedBuf);

    if (!isValid) {
      // Respuesta genérica — no revelar si el token es incorrecto o falta
      throw new UnauthorizedException('No autorizado');
    }

    return this.qrPaymentService.handleCallback(slug, dto);
  }
}
