import {
  BadRequestException,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { SafeHttpClientService } from '../../common/http/safe-http-client.service';

interface Mc4Config {
  authUrl: string;
  qrUrl: string;
  statusUrl: string;
  apiKeyAuth: string;
  apiKeyServicio: string;
  username: string;
  password: string;
}

interface Mc4AuthResponse {
  objeto?: {
    token?: string;
  };
  mensaje?: string;
}

export interface Mc4QrObject {
  imagenQr?: string;
  [key: string]: unknown;
}

export interface Mc4QrResponse {
  codigo?: string;
  mensaje?: string;
  objeto?: Mc4QrObject;
}

export interface Mc4StatusResponse {
  codigo?: string;
  mensaje?: string;
  objeto?: {
    estadoActual?: string;
    estado?: string;
    [key: string]: unknown;
  };
}

export interface GenerateMc4QrParams {
  alias: string;
  detalleGlosa: string;
  amount: number;
  fechaVencimiento: string;
}

@Injectable()
export class QrProviderService {
  private readonly logger = new Logger(QrProviderService.name);

  constructor(private readonly httpService: SafeHttpClientService) {}

  async generarQr(params: GenerateMc4QrParams): Promise<Mc4QrResponse> {
    const token = await this.generarToken();
    const cfg = this.getConfig();

    const response = await this.postMc4<Mc4QrResponse>(
      cfg.qrUrl,
      {
        alias: params.alias,
        callback: '000',
        detalleGlosa: params.detalleGlosa,
        monto: params.amount,
        moneda: 'BOB',
        fechaVencimiento: params.fechaVencimiento,
        tipoSolicitud: 'API',
        unicoUso: true,
      },
      {
        apikeyServicio: cfg.apiKeyServicio,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      30000,
      'Error al comunicarse con la API de QR',
    );

    if (response.codigo !== '0000') {
      throw new BadRequestException(
        `Error al generar QR: ${response.mensaje ?? 'Error desconocido'}`,
      );
    }

    return response;
  }

  async consultarEstado(alias: string): Promise<Mc4StatusResponse> {
    const token = await this.generarToken();
    const cfg = this.getConfig();

    return this.postMc4<Mc4StatusResponse>(
      cfg.statusUrl,
      { alias },
      {
        apikeyServicio: cfg.apiKeyServicio,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      15000,
      'Error al consultar estado del QR',
    );
  }

  private async generarToken(): Promise<string> {
    const cfg = this.getConfig();
    const response = await this.postMc4<Mc4AuthResponse>(
      cfg.authUrl,
      { username: cfg.username, password: cfg.password },
      {
        apikey: cfg.apiKeyAuth,
        'Content-Type': 'application/json',
      },
      15000,
      'Error al autenticar con la API de QR',
    );

    const token = response.objeto?.token;
    if (!token) {
      throw new InternalServerErrorException(
        'La API MC4 no devolvió un token válido',
      );
    }

    return token;
  }

  private async postMc4<TResponse>(
    url: string,
    body: Record<string, unknown>,
    headers: Record<string, string>,
    timeout: number,
    errorPrefix: string,
  ): Promise<TResponse> {
    try {
      const response = await this.httpService.post<TResponse>(url, body, {
        headers,
        timeout,
      });

      return response.data;
    } catch (error: unknown) {
      const message = this.extractMc4ErrorMessage(error);
      this.logger.error(`${errorPrefix}: ${message}`);
      throw new InternalServerErrorException(`${errorPrefix}: ${message}`);
    }
  }

  private extractMc4ErrorMessage(error: unknown): string {
    if (isHttpLikeError(error)) {
      const data = error.response?.data;
      if (isObjectRecord(data) && typeof data.mensaje === 'string') {
        return data.mensaje;
      }
    }

    if (error instanceof Error) {
      return error.message;
    }

    return 'Error de conexión';
  }

  private getConfig(): Mc4Config {
    return {
      authUrl: process.env.MC4_AUTH_URL ?? '',
      qrUrl: process.env.MC4_QR_URL ?? '',
      statusUrl: process.env.MC4_STATUS_URL ?? '',
      apiKeyAuth: process.env.MC4_API_KEY_AUTH ?? '',
      apiKeyServicio: process.env.MC4_API_KEY_SERVICIO ?? '',
      username: process.env.MC4_USERNAME ?? '',
      password: process.env.MC4_PASSWORD ?? '',
    };
  }
}

function isHttpLikeError(
  error: unknown,
): error is { response?: { data?: unknown } } {
  return isObjectRecord(error) && 'response' in error;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
