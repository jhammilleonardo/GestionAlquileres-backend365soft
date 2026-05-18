import {
  Injectable,
  BadRequestException,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { randomBytes } from 'crypto';
import { GenerateQrDto, VerifyQrDto, QrCallbackDto } from './dto';
import { TenantsService } from '../../tenants/tenants.service';
import { QrPaymentProcessingService } from './qr-payment-processing.service';
import { QrProviderService } from './qr-provider.service';
import { QrPaymentPersistenceService } from './qr-payment-persistence.service';
import { QR_ESTADO } from './qr-payment.constants';

@Injectable()
export class QrPaymentService {
  private readonly logger = new Logger(QrPaymentService.name);

  constructor(
    private tenantsService: TenantsService,
    private qrPaymentProcessingService: QrPaymentProcessingService,
    private qrProviderService: QrProviderService,
    private qrPaymentPersistenceService: QrPaymentPersistenceService,
  ) {}

  /** Devuelve el schema del tenant a partir del slug */
  private async getSchema(slug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(slug);
    return tenant.schema_name;
  }

  // ============================================================
  // ENDPOINTS PÚBLICOS
  // ============================================================

  /**
   * Genera un QR dinámico de pago.
   */
  async generarQrDinamico(slug: string, dto: GenerateQrDto) {
    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);

    // Obtener datos del tenant/inquilino
    const tenant = await this.qrPaymentPersistenceService.findTenantUser(
      schemaName,
      dto.tenant_id,
    );

    if (!tenant) {
      throw new NotFoundException(
        `Inquilino con id ${dto.tenant_id} no encontrado`,
      );
    }

    const nombreCompleto = tenant.name?.trim() ?? '';

    // Si se proporciona contract_id, verificar que pertenece al tenant autenticado
    let detalleGlosa = 'Alquiler';
    if (dto.contract_id) {
      const belongsToTenant =
        await this.qrPaymentPersistenceService.contractBelongsToTenant(
          schemaName,
          dto.contract_id,
          dto.tenant_id,
        );
      if (belongsToTenant) {
        detalleGlosa += ` - ${nombreCompleto} - Contrato #${dto.contract_id}`;
      } else {
        throw new ForbiddenException(
          `El contrato #${dto.contract_id} no pertenece a este inquilino`,
        );
      }
    } else {
      detalleGlosa += ` - ${nombreCompleto}`;
    }

    const alias = this.createAlias(dto.tenant_id);
    const fechaVencimiento = this.createExpirationDate();
    const fechaVencimientoStr = this.formatMc4ExpirationDate(fechaVencimiento);

    const mc4Response = await this.qrProviderService.generarQr({
      alias,
      detalleGlosa,
      amount: dto.amount,
      fechaVencimiento: fechaVencimientoStr,
    });

    return this.qrPaymentPersistenceService.createPendingQr(schemaName, {
      alias,
      detalleGlosa,
      imagenQr: mc4Response.objeto ?? null,
      fechaVencimiento,
      dto,
    });
  }

  private createAlias(tenantId: number): string {
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const randomSuffix = randomBytes(4).toString('hex');
    return `QR365T${tenantId}T${timestamp}${randomSuffix}`;
  }

  private createExpirationDate(): Date {
    const fechaVencimiento = new Date();
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 1);
    return fechaVencimiento;
  }

  private formatMc4ExpirationDate(date: Date): string {
    return date
      .toLocaleDateString('es-BO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/La_Paz',
      })
      .replace(/\//g, '/');
  }

  /**
   * Verifica el estado actual de un QR consultando la API MC4.
   * tenantId: ID del usuario autenticado — se usa para verificar ownership del QR.
   * Pasar undefined solo desde rutas de ADMIN.
   */
  async verificarEstadoQr(slug: string, dto: VerifyQrDto, tenantId?: number) {
    this.logger.debug(`[verificar] dto recibido: ${JSON.stringify(dto)}`);

    if (dto.qr_id === undefined && dto.alias === undefined) {
      throw new BadRequestException('Se requiere qr_id o alias');
    }

    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);

    const qr = dto.qr_id
      ? await this.qrPaymentPersistenceService.findById(schemaName, dto.qr_id)
      : await this.qrPaymentPersistenceService.findByAlias(
          schemaName,
          String(dto.alias),
        );

    if (!qr) {
      throw new NotFoundException(
        dto.qr_id
          ? `QR con id ${dto.qr_id} no encontrado`
          : `QR con alias ${dto.alias} no encontrado`,
      );
    }

    // Verificar que el QR pertenece al tenant autenticado (solo en rutas de tenant)
    this.qrPaymentPersistenceService.assertTenantOwnership(
      qr,
      tenantId,
      'verificar',
    );

    const mc4Response = await this.qrProviderService.consultarEstado(qr.alias);

    if (mc4Response?.codigo !== '0000') {
      return {
        success: false,
        status: qr.estado,
        qr,
        estado_transaccion: mc4Response,
        message: `Error al consultar estado: ${mc4Response?.mensaje ?? 'Error desconocido'}`,
      };
    }

    const estadoActual: string = mc4Response.objeto?.estadoActual ?? qr.estado;
    const estadoAnterior: string = qr.estado;

    const qrActualizado =
      await this.qrPaymentPersistenceService.updateEstadoAndRefresh(
        schemaName,
        qr.id,
        estadoActual,
      );

    // Si pasó a PAGADO, registrar el pago automáticamente
    if (
      estadoActual === QR_ESTADO.PAGADO &&
      (estadoAnterior !== QR_ESTADO.PAGADO || !qrActualizado.pago_id)
    ) {
      await this.qrPaymentProcessingService.procesarPagoQr(
        schemaName,
        qrActualizado,
      );
    }

    return this.qrPaymentPersistenceService.mapQrRecord(qrActualizado);
  }

  /**
   * Callback recibido desde el banco MC4/SIP cuando se realiza un pago.
   * Este endpoint es PÚBLICO (sin JWT) — el banco lo llama directamente.
   *
   * Capas de seguridad aplicadas aquí (además del token verificado en el controller):
   *  Capa 3: Validar que el alias tenga el formato generado por este sistema (QR365T...)
   *  Capa 4: Si el banco envía monto, verificar que coincide con el registrado en BD
   *          (previene manipulación de montos desde un callback falso)
   */
  async handleCallback(slug: string, dto: QrCallbackDto) {
    // Capa 3: Validar formato del alias — solo acepta aliases generados por este sistema.
    // Patrón: QR365T{tenant_id}T{14 dígitos timestamp}{8 hex chars}
    const ALIAS_PATTERN = /^QR365T\d+T\d{14}[0-9a-f]{8}$/i;
    if (!dto.alias || !ALIAS_PATTERN.test(dto.alias)) {
      this.logger.warn(
        `[callback] Alias con formato inválido rechazado: ${dto.alias}`,
      );
      // Respuesta genérica — no revelar por qué se rechaza
      return { codigo: '1212', mensaje: 'Error en la solicitud' };
    }

    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);
    const qr = await this.qrPaymentPersistenceService.findByAlias(
      schemaName,
      dto.alias,
    );

    if (!qr) {
      // Respuesta genérica — no confirmar ni negar si el alias existe
      return { codigo: '1212', mensaje: 'Error en la solicitud' };
    }

    // Capa 4: Si el banco envía el monto, verificar que coincide con el registrado en BD.
    // Diferencia máxima tolerada: 0.01 (redondeo de centavos).
    if (dto.monto !== undefined && dto.monto !== null) {
      const montoBD = Number(qr.monto);
      const montoCallback = parseFloat(String(dto.monto));
      if (Math.abs(montoBD - montoCallback) > 0.01) {
        this.logger.warn(
          `[callback] Discrepancia de monto en alias ${dto.alias}: BD=${montoBD} callback=${montoCallback}`,
        );
        return { codigo: '1212', mensaje: 'Error en la solicitud' };
      }
    }

    if (qr.estado === QR_ESTADO.PAGADO) {
      return { codigo: '0000', mensaje: 'Registro Exitoso' };
    }

    // PENDIENTE, CANCELADO, VENCIDO — confirmar recepción sin cambiar estado
    // El estado se actualiza solo a través de verificarEstadoQr (que llama a MC4 directamente)
    return { codigo: '1212', mensaje: 'Notificación recibida' };
  }

  /**
   * Cancela un QR pendiente.
   * tenantId: ID del usuario autenticado — se usa para verificar ownership del QR.
   * Pasar undefined solo desde rutas de ADMIN.
   */
  async cancelarQr(slug: string, qrId: number, tenantId?: number) {
    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);
    return this.qrPaymentPersistenceService.cancelQr(
      schemaName,
      qrId,
      tenantId,
    );
  }

  /**
   * Obtener todos los QRs de un tenant (admin)
   */
  async listarQrs(slug: string, tenantId?: number) {
    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);
    return this.qrPaymentPersistenceService.listQrs(schemaName, tenantId);
  }

  /**
   * Obtener mis QRs (inquilino)
   */
  async listarMisQrs(slug: string, tenantId: number) {
    const schemaName = await this.getSchema(slug);
    await this.qrPaymentPersistenceService.ensureQrTable(schemaName);
    return this.qrPaymentPersistenceService.listMappedQrs(schemaName, tenantId);
  }
}
