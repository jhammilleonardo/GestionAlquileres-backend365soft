import {
  BadGatewayException,
  BadRequestException,
  Injectable,
  PayloadTooLargeException,
  UnsupportedMediaTypeException,
} from '@nestjs/common';
import { Agent as HttpAgent, get as httpGet } from 'node:http';
import { Agent as HttpsAgent, get as httpsGet } from 'node:https';
import { BlockList, isIP, type LookupFunction } from 'node:net';
import { lookup } from 'node:dns/promises';

const MAX_TEXT_BYTES = 1024 * 1024;
const MAX_JSON_BYTES = 2 * 1024 * 1024;

export interface NativeHttpResponse<T> {
  data: T;
  status: number;
  headers: Headers;
}

export class NativeHttpError extends Error {
  constructor(
    message: string,
    readonly response?: { status: number; data: unknown },
  ) {
    super(message);
  }
}

@Injectable()
export class SafeHttpClientService {
  private readonly blockedAddresses = this.createBlockList();
  private readonly safeLookup = this.createSafeLookup();
  private readonly httpAgent = new HttpAgent({
    keepAlive: false,
    lookup: this.safeLookup,
  });
  private readonly httpsAgent = new HttpsAgent({
    keepAlive: false,
    lookup: this.safeLookup,
  });

  async getCalendarText(rawUrl: string): Promise<string> {
    const url = this.validatePublicHttpUrl(rawUrl);

    try {
      return await this.requestCalendar(url, 0);
    } catch (error) {
      if (
        error instanceof BadRequestException ||
        error instanceof UnsupportedMediaTypeException ||
        error instanceof PayloadTooLargeException
      ) {
        throw error;
      }
      throw new BadGatewayException(
        'No se pudo descargar el calendario externo',
      );
    }
  }

  async post<T>(
    rawUrl: string,
    body: unknown,
    options: { headers?: Record<string, string>; timeout?: number } = {},
  ): Promise<NativeHttpResponse<T>> {
    const url = this.validateConfiguredHttpUrl(rawUrl);
    const headers = new Headers(options.headers ?? {});
    const serializedBody =
      typeof body === 'string' ? body : JSON.stringify(body);
    if (typeof body !== 'string' && !headers.has('content-type')) {
      headers.set('content-type', 'application/json');
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method: 'POST',
        headers,
        body: serializedBody,
        redirect: 'error',
        signal: AbortSignal.timeout(options.timeout ?? 15000),
      });
    } catch (error) {
      throw new NativeHttpError(
        error instanceof Error ? error.message : 'Error de conexión HTTP',
      );
    }

    const text = await this.readFetchBody(response, MAX_JSON_BYTES);
    const data = this.parseResponseBody(text, response.headers) as T;
    if (!response.ok) {
      throw new NativeHttpError(`HTTP ${response.status}`, {
        status: response.status,
        data,
      });
    }
    return { data, status: response.status, headers: response.headers };
  }

  validatePublicHttpUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('URL de calendario inválida');
    }

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new BadRequestException('La URL debe usar HTTP o HTTPS');
    }
    if (url.username || url.password) {
      throw new BadRequestException('La URL no puede incluir credenciales');
    }
    this.assertPublicHostname(url.hostname);
    return url;
  }

  private validateConfiguredHttpUrl(rawUrl: string): URL {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      throw new BadRequestException('URL HTTP inválida');
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password
    ) {
      throw new BadRequestException('Endpoint HTTP no permitido');
    }
    return url;
  }

  private requestCalendar(url: URL, redirects: number): Promise<string> {
    if (redirects > 3) {
      throw new BadGatewayException('Demasiadas redirecciones de calendario');
    }
    const transport = url.protocol === 'https:' ? httpsGet : httpGet;
    const agent = url.protocol === 'https:' ? this.httpsAgent : this.httpAgent;

    return new Promise((resolve, reject) => {
      const request = transport(
        url,
        {
          agent,
          headers: { Accept: 'text/calendar, text/plain;q=0.9' },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          if (status >= 300 && status < 400 && response.headers.location) {
            response.resume();
            try {
              const redirected = new URL(response.headers.location, url);
              this.validateRedirectTarget(
                redirected.protocol,
                redirected.hostname,
              );
              void this.requestCalendar(redirected, redirects + 1).then(
                resolve,
                reject,
              );
            } catch (error) {
              reject(error instanceof Error ? error : new Error(String(error)));
            }
            return;
          }
          if (status < 200 || status >= 300) {
            response.resume();
            reject(
              new BadGatewayException(`Calendario respondió HTTP ${status}`),
            );
            return;
          }

          const contentLength = Number(response.headers['content-length'] ?? 0);
          if (contentLength > MAX_TEXT_BYTES) {
            response.destroy();
            reject(new PayloadTooLargeException('El calendario supera 1 MB'));
            return;
          }
          const contentType = String(response.headers['content-type'] ?? '')
            .split(';', 1)[0]
            .trim()
            .toLowerCase();
          if (
            contentType &&
            !contentType.startsWith('text/') &&
            contentType !== 'application/ics' &&
            contentType !== 'application/icalendar'
          ) {
            response.destroy();
            reject(
              new UnsupportedMediaTypeException(
                'La URL no devolvió un calendario de texto',
              ),
            );
            return;
          }

          const chunks: Buffer[] = [];
          let size = 0;
          response.on('data', (chunk: Buffer | string) => {
            const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            size += buffer.length;
            if (size > MAX_TEXT_BYTES) {
              response.destroy(
                new PayloadTooLargeException('El calendario supera 1 MB'),
              );
              return;
            }
            chunks.push(buffer);
          });
          response.on('end', () =>
            resolve(Buffer.concat(chunks).toString('utf8')),
          );
          response.on('error', reject);
        },
      );
      request.setTimeout(15000, () => request.destroy(new Error('Timeout')));
      request.on('error', reject);
    });
  }

  private async readFetchBody(
    response: Response,
    maxBytes: number,
  ): Promise<string> {
    const contentLength = Number(response.headers.get('content-length') ?? 0);
    if (contentLength > maxBytes) {
      throw new PayloadTooLargeException(
        'La respuesta HTTP es demasiado grande',
      );
    }
    if (!response.body) return '';

    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new PayloadTooLargeException(
          'La respuesta HTTP es demasiado grande',
        );
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks.map((chunk) => Buffer.from(chunk))).toString(
      'utf8',
    );
  }

  private parseResponseBody(text: string, headers: Headers): unknown {
    if (!text) return {};
    const contentType = headers.get('content-type')?.toLowerCase() ?? '';
    if (contentType.includes('json')) {
      try {
        return JSON.parse(text) as unknown;
      } catch {
        throw new BadGatewayException('La respuesta JSON externa es inválida');
      }
    }
    try {
      return JSON.parse(text) as unknown;
    } catch {
      return text;
    }
  }

  private validateRedirectTarget(protocol: string, hostname: string): void {
    if (!['http:', 'https:'].includes(protocol)) {
      throw new BadRequestException('Redirección de calendario no permitida');
    }
    this.assertPublicHostname(hostname);
  }

  private assertPublicHostname(rawHostname: string): void {
    const hostname = rawHostname.replace(/^\[|\]$/g, '').toLowerCase();
    if (
      !hostname ||
      hostname === 'localhost' ||
      hostname.endsWith('.localhost') ||
      hostname.endsWith('.local') ||
      hostname.endsWith('.internal')
    ) {
      throw new BadRequestException('Host de calendario no permitido');
    }

    const family = isIP(hostname);
    if (family && this.isBlockedAddress(hostname, family)) {
      throw new BadRequestException('La URL apunta a una red no permitida');
    }
    if (!family && !hostname.includes('.')) {
      throw new BadRequestException('El host debe ser un dominio público');
    }
  }

  private createSafeLookup(): LookupFunction {
    return ((
      hostname: string,
      options: unknown,
      callback: (
        error: NodeJS.ErrnoException | null,
        address?: string,
        family?: number,
      ) => void,
    ) => {
      const family =
        typeof options === 'number'
          ? options
          : Number((options as { family?: number } | undefined)?.family ?? 0);

      void lookup(hostname, { all: true, verbatim: true, family })
        .then((addresses) => {
          if (
            addresses.length === 0 ||
            addresses.some((entry) =>
              this.isBlockedAddress(entry.address, entry.family),
            )
          ) {
            const error = new Error(
              'El dominio resolvió a una red no permitida',
            ) as NodeJS.ErrnoException;
            error.code = 'EACCES';
            callback(error);
            return;
          }
          const selected = addresses[0];
          callback(null, selected.address, selected.family);
        })
        .catch((error: NodeJS.ErrnoException) => callback(error));
    }) as LookupFunction;
  }

  private isBlockedAddress(address: string, family: number): boolean {
    const normalizedFamily = family === 6 ? 'ipv6' : 'ipv4';
    return this.blockedAddresses.check(address, normalizedFamily);
  }

  private createBlockList(): BlockList {
    const list = new BlockList();
    for (const [network, prefix] of [
      ['0.0.0.0', 8],
      ['10.0.0.0', 8],
      ['100.64.0.0', 10],
      ['127.0.0.0', 8],
      ['169.254.0.0', 16],
      ['172.16.0.0', 12],
      ['192.0.0.0', 24],
      ['192.0.2.0', 24],
      ['192.168.0.0', 16],
      ['198.18.0.0', 15],
      ['198.51.100.0', 24],
      ['203.0.113.0', 24],
      ['224.0.0.0', 4],
      ['240.0.0.0', 4],
    ] as const) {
      list.addSubnet(network, prefix, 'ipv4');
    }
    for (const [network, prefix] of [
      ['::', 128],
      ['::1', 128],
      ['::ffff:0:0', 96],
      ['fc00::', 7],
      ['fe80::', 10],
      ['ff00::', 8],
      ['2001:db8::', 32],
    ] as const) {
      list.addSubnet(network, prefix, 'ipv6');
    }
    return list;
  }
}

export const nativeHttpClient = new SafeHttpClientService();
