import {
  Injectable,
  BadRequestException,
  NotFoundException,
  InternalServerErrorException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { randomBytes } from 'crypto';
import { GenerateQrDto, VerifyQrDto, QrCallbackDto } from './dto';
import { TenantsService } from '../../tenants/tenants.service';

/**
 * Estados del QR (equivalente al modelo Qr de Laravel)
 */
export const QR_ESTADO = {
  PENDIENTE: 'PENDIENTE',
  PAGADO: 'PAGADO',
  CANCELADO: 'CANCELADO',
  VENCIDO: 'VENCIDO',
} as const;

export type QrEstado = (typeof QR_ESTADO)[keyof typeof QR_ESTADO];

/**
 * Configuración MC4/SIP – leída desde variables de entorno.
 * Las credenciales NUNCA deben estar hardcodeadas en el código fuente.
 */
function getMc4Config() {
  return {
    AUTH_URL:         process.env.MC4_AUTH_URL         ?? '',
    QR_URL:           process.env.MC4_QR_URL           ?? '',
    STATUS_URL:       process.env.MC4_STATUS_URL       ?? '',
    API_KEY_AUTH:     process.env.MC4_API_KEY_AUTH     ?? '',
    API_KEY_SERVICIO: process.env.MC4_API_KEY_SERVICIO ?? '',
    USERNAME:         process.env.MC4_USERNAME         ?? '',
    PASSWORD:         process.env.MC4_PASSWORD         ?? '',
  };
}

@Injectable()
export class QrPaymentService {
  private readonly logger = new Logger(QrPaymentService.name);

  /** Schemas donde ya se garantizó que la tabla existe (cache en memoria). */
  private readonly initializedSchemas = new Set<string>();

  constructor(
    private dataSource: DataSource,
    private httpService: HttpService,
    private tenantsService: TenantsService,
  ) {}

  // ============================================================
  // MÉTODOS PRIVADOS – COMUNICACIÓN CON MC4/SIP
  // ============================================================

  /**
   * Genera un token de autenticación en la API MC4/SIP.
   */
  private async generarToken(): Promise<string> {
    const cfg = getMc4Config();
    try {
      const response = await firstValueFrom(
        this.httpService.post(
          cfg.AUTH_URL,
          { username: cfg.USERNAME, password: cfg.PASSWORD },
          {
            headers: {
              apikey: cfg.API_KEY_AUTH,
              'Content-Type': 'application/json',
            },
            timeout: 15000,
          },
        ),
      );

      const token: string | undefined = response.data?.objeto?.token;
      if (!token) {
        throw new InternalServerErrorException(
          'La API MC4 no devolvió un token válido',
        );
      }
      return token;
    } catch (error: any) {
      const msg =
        error?.response?.data?.mensaje ??
        error?.message ??
        'Error de conexión con MC4';
      this.logger.error(`Error generando token MC4: ${msg}`);
      throw new InternalServerErrorException(
        `Error al autenticar con la API de QR: ${msg}`,
      );
    }
  }

  /** Devuelve el schema del tenant a partir del slug */
  private async getSchema(slug: string): Promise<string> {
    const tenant = await this.tenantsService.findBySlug(slug);
    return tenant.schema_name;
  }

  // ============================================================
  // TABLA qr_payments – ASEGURAR QUE EXISTE EN EL SCHEMA
  // ============================================================

  /**
   * Mapea un registro de la tabla qr_payments al formato que espera el frontend.
   */
  private _mapQrRecord(qr: any, dto?: Partial<GenerateQrDto>): any {
    let qrImage: string | null = null;
    if (qr.imagen_qr) {
      try {
        const parsed =
          typeof qr.imagen_qr === 'string'
            ? JSON.parse(qr.imagen_qr)
            : qr.imagen_qr;
        qrImage = parsed.imagenQr ?? null;
      } catch {
        qrImage = qr.imagen_qr;
      }
    }
    return {
      id: qr.id,
      tenant_id: qr.tenant_id,
      contract_id: qr.contract_id ?? null,
      amount: parseFloat(qr.monto),
      currency: qr.currency ?? dto?.currency ?? 'BOB',
      payment_type: qr.payment_type ?? dto?.payment_type ?? 'RENT',
      status: qr.estado,
      qr_image: qrImage,
      notes: dto?.notes ?? qr.detalle_glosa ?? null,
      expires_at: qr.fecha_vencimiento,
      created_at: qr.created_at,
      updated_at: qr.updated_at,
    };
  }

  /**
   * Crea la tabla qr_payments en el schema del tenant si no existe.
   * Usa un cache en memoria para ejecutar las sentencias DDL solo una vez
   * por schema durante la vida del proceso (evita overhead en cada request).
   */
  async ensureQrTable(schemaName: string): Promise<void> {
    if (this.initializedSchemas.has(schemaName)) return;

    await this.dataSource.query(`
      CREATE TABLE IF NOT EXISTS ${schemaName}.qr_payments (
        id           SERIAL PRIMARY KEY,
        alias        VARCHAR(80)    NOT NULL UNIQUE,
        estado       VARCHAR(20)    NOT NULL DEFAULT '${QR_ESTADO.PENDIENTE}',
        tenant_id    INTEGER        NOT NULL,
        contract_id  INTEGER,
        pago_id      INTEGER,
        monto        DECIMAL(12,2)  NOT NULL,
        currency     VARCHAR(10)    NOT NULL DEFAULT 'BOB',
        payment_type VARCHAR(30)    NOT NULL DEFAULT 'RENT',
        detalle_glosa VARCHAR(255),
        imagen_qr    TEXT,
        fecha_vencimiento TIMESTAMP NOT NULL,
        created_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at   TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);
    await this.dataSource.query(`
      ALTER TABLE ${schemaName}.qr_payments ADD COLUMN IF NOT EXISTS currency VARCHAR(10) NOT NULL DEFAULT 'BOB';
      ALTER TABLE ${schemaName}.qr_payments ADD COLUMN IF NOT EXISTS payment_type VARCHAR(30) NOT NULL DEFAULT 'RENT';
    `);
    await this.dataSource.query(`
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_ALIAS
        ON ${schemaName}.qr_payments(alias);
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_TENANT
        ON ${schemaName}.qr_payments(tenant_id);
      CREATE INDEX IF NOT EXISTS IDX_QR_PAYMENTS_ESTADO
        ON ${schemaName}.qr_payments(estado);
    `);

    this.initializedSchemas.add(schemaName);
  }

  // ============================================================
  // ENDPOINTS PÚBLICOS
  // ============================================================

  /**
   * Genera un QR dinámico de pago.
   */
  async generarQrDinamico(slug: string, dto: GenerateQrDto) {
    const schemaName = await this.getSchema(slug);
    await this.ensureQrTable(schemaName);

    // Obtener datos del tenant/inquilino
    const tenantRows = await this.dataSource.query(
      `SELECT id, name FROM ${schemaName}."user" WHERE id = $1 LIMIT 1`,
      [dto.tenant_id],
    );

    if (!tenantRows || tenantRows.length === 0) {
      throw new NotFoundException(
        `Inquilino con id ${dto.tenant_id} no encontrado`,
      );
    }

    const tenant = tenantRows[0];
    const nombreCompleto = tenant.name?.trim() ?? '';

    // Si se proporciona contract_id, verificar que pertenece al tenant autenticado
    let detalleGlosa = 'Alquiler';
    if (dto.contract_id) {
      const contrato = await this.dataSource.query(
        `SELECT id FROM ${schemaName}.contracts WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
        [dto.contract_id, dto.tenant_id],
      );
      if (contrato && contrato.length > 0) {
        detalleGlosa += ` - ${nombreCompleto} - Contrato #${dto.contract_id}`;
      } else {
        // El contrato no existe o no pertenece a este tenant
        throw new ForbiddenException(
          `El contrato #${dto.contract_id} no pertenece a este inquilino`,
        );
      }
    } else {
      detalleGlosa += ` - ${nombreCompleto}`;
    }

    // Construir alias único con alta entropía (crypto.randomBytes)
    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-T:.Z]/g, '')
      .slice(0, 14);
    const randomSuffix = randomBytes(4).toString('hex'); // 8 chars hex, ~4 mil millones de posibilidades
    const alias = `QR365T${dto.tenant_id}T${timestamp}${randomSuffix}`;

    // Fecha de vencimiento: mañana
    const fechaVencimiento = new Date(now);
    fechaVencimiento.setDate(fechaVencimiento.getDate() + 1);
    const fechaVencimientoStr = fechaVencimiento
      .toLocaleDateString('es-BO', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'America/La_Paz',
      })
      .replace(/\//g, '/');

    // Obtener token MC4
    const token = await this.generarToken();
    const cfg = getMc4Config();

    // Llamar a la API MC4 para generar el QR
    let mc4Response: any;
    try {
      const resp = await firstValueFrom(
        this.httpService.post(
          cfg.QR_URL,
          {
            alias,
            callback: '000',
            detalleGlosa,
            monto: dto.amount,
            moneda: 'BOB',
            fechaVencimiento: fechaVencimientoStr,
            tipoSolicitud: 'API',
            unicoUso: true,
          },
          {
            headers: {
              apikeyServicio: cfg.API_KEY_SERVICIO,
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            timeout: 30000,
          },
        ),
      );
      mc4Response = resp.data;
    } catch (error: any) {
      const msg =
        error?.response?.data?.mensaje ??
        error?.message ??
        'Error de conexión';
      throw new InternalServerErrorException(
        `Error al comunicarse con la API de QR: ${msg}`,
      );
    }

    if (mc4Response?.codigo !== '0000') {
      throw new BadRequestException(
        `Error al generar QR: ${mc4Response?.mensaje ?? 'Error desconocido'}`,
      );
    }

    // Guardar en BD
    const rows = await this.dataSource.query(
      `INSERT INTO ${schemaName}.qr_payments
         (alias, estado, tenant_id, contract_id, monto, currency, payment_type, detalle_glosa, imagen_qr, fecha_vencimiento, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
       RETURNING *`,
      [
        alias,
        QR_ESTADO.PENDIENTE,
        dto.tenant_id,
        dto.contract_id ?? null,
        dto.amount,
        dto.currency ?? 'BOB',
        dto.payment_type ?? 'RENT',
        detalleGlosa,
        mc4Response.objeto ? JSON.stringify(mc4Response.objeto) : null,
        fechaVencimiento,
      ],
    );

    const qr = rows[0];
    return this._mapQrRecord(qr, dto);
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
    await this.ensureQrTable(schemaName);

    let qr: any;
    if (dto.qr_id) {
      const rows = await this.dataSource.query(
        `SELECT * FROM ${schemaName}.qr_payments WHERE id = $1 LIMIT 1`,
        [dto.qr_id],
      );
      if (!rows || rows.length === 0) {
        throw new NotFoundException(`QR con id ${dto.qr_id} no encontrado`);
      }
      qr = rows[0];
    } else {
      const rows = await this.dataSource.query(
        `SELECT * FROM ${schemaName}.qr_payments WHERE alias = $1 LIMIT 1`,
        [dto.alias],
      );
      if (!rows || rows.length === 0) {
        throw new NotFoundException(`QR con alias ${dto.alias} no encontrado`);
      }
      qr = rows[0];
    }

    // Verificar que el QR pertenece al tenant autenticado (solo en rutas de tenant)
    if (tenantId !== undefined && qr.tenant_id !== tenantId) {
      throw new ForbiddenException('No tienes permiso para verificar este QR');
    }

    const token = await this.generarToken();
    const cfg = getMc4Config();

    let mc4Response: any;
    try {
      const resp = await firstValueFrom(
        this.httpService.post(
          cfg.STATUS_URL,
          { alias: qr.alias },
          {
            headers: {
              apikeyServicio: cfg.API_KEY_SERVICIO,
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            timeout: 15000,
          },
        ),
      );
      mc4Response = resp.data;
    } catch (error: any) {
      const msg =
        error?.response?.data?.mensaje ??
        error?.message ??
        'Error de conexión';
      throw new InternalServerErrorException(
        `Error al consultar estado del QR: ${msg}`,
      );
    }

    if (mc4Response?.codigo !== '0000') {
      return {
        success: false,
        qr,
        estado_transaccion: mc4Response,
        message: `Error al consultar estado: ${mc4Response?.mensaje ?? 'Error desconocido'}`,
      };
    }

    const estadoActual: string = mc4Response.objeto?.estadoActual ?? qr.estado;
    const estadoAnterior: string = qr.estado;

    // Actualizar estado en BD
    await this.dataSource.query(
      `UPDATE ${schemaName}.qr_payments
       SET estado = $1, updated_at = NOW()
       WHERE id = $2`,
      [estadoActual, qr.id],
    );

    // Refrescar registro
    const [qrActualizado] = await this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments WHERE id = $1`,
      [qr.id],
    );

    // Si pasó a PAGADO, registrar el pago automáticamente
    if (
      estadoActual === QR_ESTADO.PAGADO &&
      estadoAnterior !== QR_ESTADO.PAGADO
    ) {
      await this.procesarPagoQr(schemaName, qrActualizado, mc4Response);
    }

    return this._mapQrRecord(qrActualizado);
  }

  /**
   * Procesa el pago automáticamente en la tabla payments
   * cuando el QR es marcado como PAGADO.
   */
  private async procesarPagoQr(
    schemaName: string,
    qr: any,
    mc4Response: any,
  ): Promise<any> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      await queryRunner.query(`SET search_path TO ${schemaName}`);

      let contractId: number = qr.contract_id;
      let propertyId: number | null = null;

      if (!contractId) {
        const contracts = await queryRunner.query(
          `SELECT id, property_id FROM contracts
           WHERE tenant_id = $1 AND status IN ('ACTIVO', 'POR_VENCER')
           ORDER BY created_at DESC LIMIT 1`,
          [qr.tenant_id],
        );
        if (contracts && contracts.length > 0) {
          contractId = contracts[0].id;
          propertyId = contracts[0].property_id;
        }
      } else {
        const contracts = await queryRunner.query(
          `SELECT property_id FROM contracts WHERE id = $1 LIMIT 1`,
          [contractId],
        );
        if (contracts && contracts.length > 0) {
          propertyId = contracts[0].property_id;
        }
      }

      let paymentId: number | null = null;

      if (contractId && propertyId) {
        const today = new Date().toISOString().split('T')[0];
        const [payment] = await queryRunner.query(
          `INSERT INTO payments (
             tenant_id, contract_id, property_id, amount, currency,
             payment_type, payment_method, status, payment_date,
             reference_number, notes, payment_processor,
             created_at, updated_at
           ) VALUES ($1,$2,$3,$4,'BOB','ALQUILER','QR_MC4','APPROVED',$5,$6,$7,'mc4_qr',NOW(),NOW())
           RETURNING id`,
          [
            qr.tenant_id,
            contractId,
            propertyId,
            qr.monto,
            today,
            `QR-${qr.alias}`,
            qr.detalle_glosa ?? 'Pago vía QR MC4',
          ],
        );
        paymentId = payment?.id ?? null;
      }

      await queryRunner.query(
        `UPDATE qr_payments SET pago_id = $1, estado = $2, updated_at = NOW() WHERE id = $3`,
        [paymentId, QR_ESTADO.PAGADO, qr.id],
      );

      await queryRunner.commitTransaction();

      return {
        payment_processed: true,
        payment_id: paymentId,
        qr_id: qr.id,
        qr_monto: qr.monto,
        message: 'QR marcado como pagado y pago registrado automáticamente.',
      };
    } catch (error) {
      await queryRunner.rollbackTransaction();
      this.logger.error(`Error procesando pago QR: ${error}`);
      throw error;
    } finally {
      await queryRunner.release();
    }
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
      this.logger.warn(`[callback] Alias con formato inválido rechazado: ${dto.alias}`);
      // Respuesta genérica — no revelar por qué se rechaza
      return { codigo: '1212', mensaje: 'Error en la solicitud' };
    }

    const schemaName = await this.getSchema(slug);
    await this.ensureQrTable(schemaName);

    const rows = await this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments WHERE alias = $1 LIMIT 1`,
      [dto.alias],
    );

    const qr = rows?.[0];

    if (!qr) {
      // Respuesta genérica — no confirmar ni negar si el alias existe
      return { codigo: '1212', mensaje: 'Error en la solicitud' };
    }

    // Capa 4: Si el banco envía el monto, verificar que coincide con el registrado en BD.
    // Diferencia máxima tolerada: 0.01 (redondeo de centavos).
    if (dto.monto !== undefined && dto.monto !== null) {
      const montoBD = parseFloat(qr.monto);
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
    await this.ensureQrTable(schemaName);

    const rows = await this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments WHERE id = $1 LIMIT 1`,
      [qrId],
    );

    if (!rows || rows.length === 0) {
      throw new NotFoundException(`QR con id ${qrId} no encontrado`);
    }

    const qr = rows[0];

    // Verificar que el QR pertenece al tenant autenticado (solo en rutas de tenant)
    if (tenantId !== undefined && qr.tenant_id !== tenantId) {
      throw new ForbiddenException('No tienes permiso para cancelar este QR');
    }

    if (qr.estado === QR_ESTADO.PAGADO) {
      throw new BadRequestException(
        'No se puede cancelar un QR que ya ha sido pagado',
      );
    }

    await this.dataSource.query(
      `UPDATE ${schemaName}.qr_payments SET estado = $1, updated_at = NOW() WHERE id = $2`,
      [QR_ESTADO.CANCELADO, qrId],
    );

    const [updated] = await this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments WHERE id = $1`,
      [qrId],
    );
    return this._mapQrRecord(updated);
  }

  /**
   * Obtener todos los QRs de un tenant (admin)
   */
  async listarQrs(slug: string, tenantId?: number) {
    const schemaName = await this.getSchema(slug);
    await this.ensureQrTable(schemaName);

    if (tenantId) {
      return this.dataSource.query(
        `SELECT * FROM ${schemaName}.qr_payments WHERE tenant_id = $1 ORDER BY created_at DESC`,
        [tenantId],
      );
    }

    return this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments ORDER BY created_at DESC`,
    );
  }

  /**
   * Obtener mis QRs (inquilino)
   */
  async listarMisQrs(slug: string, tenantId: number) {
    const schemaName = await this.getSchema(slug);
    await this.ensureQrTable(schemaName);

    const rows = await this.dataSource.query(
      `SELECT * FROM ${schemaName}.qr_payments WHERE tenant_id = $1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return rows.map((r: any) => this._mapQrRecord(r));
  }
}
