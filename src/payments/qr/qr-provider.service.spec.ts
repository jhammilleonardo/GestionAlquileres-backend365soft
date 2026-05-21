import {
  BadRequestException,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { of, throwError } from 'rxjs';
import { QrProviderService } from './qr-provider.service';

describe('QrProviderService', () => {
  let service: QrProviderService;
  let httpService: {
    post: jest.Mock;
  };
  let loggerErrorSpy: jest.SpyInstance;
  const envBackup = { ...process.env };

  beforeEach(() => {
    loggerErrorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation();

    process.env.MC4_AUTH_URL = 'https://mc4.test/auth';
    process.env.MC4_QR_URL = 'https://mc4.test/qr';
    process.env.MC4_STATUS_URL = 'https://mc4.test/status';
    process.env.MC4_API_KEY_AUTH = 'auth-key';
    process.env.MC4_API_KEY_SERVICIO = 'service-key';
    process.env.MC4_USERNAME = 'user';
    process.env.MC4_PASSWORD = 'pass';

    httpService = {
      post: jest.fn(),
    };
    service = new QrProviderService(httpService as unknown as HttpService);
  });

  afterEach(() => {
    loggerErrorSpy.mockRestore();
  });

  afterAll(() => {
    process.env = envBackup;
  });

  it('genera QR autenticándose primero contra MC4', async () => {
    httpService.post
      .mockReturnValueOnce(
        of({
          data: {
            objeto: {
              token: 'token-1',
            },
          },
        }),
      )
      .mockReturnValueOnce(
        of({
          data: {
            codigo: '0000',
            objeto: {
              imagenQr: 'base64',
            },
          },
        }),
      );

    await expect(
      service.generarQr({
        alias: 'QR365T7T20260517000000abcdef12',
        detalleGlosa: 'Alquiler',
        amount: 100,
        fechaVencimiento: '18/05/2026',
      }),
    ).resolves.toMatchObject({
      codigo: '0000',
      objeto: { imagenQr: 'base64' },
    });

    const authCall = httpService.post.mock.calls[0] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string>; timeout: number },
    ];
    const qrCall = httpService.post.mock.calls[1] as [
      string,
      Record<string, unknown>,
      { headers: Record<string, string>; timeout: number },
    ];

    expect(authCall[0]).toBe('https://mc4.test/auth');
    expect(authCall[1]).toEqual({ username: 'user', password: 'pass' });
    expect(authCall[2].headers.apikey).toBe('auth-key');
    expect(authCall[2].timeout).toBe(15000);
    expect(qrCall[0]).toBe('https://mc4.test/qr');
    expect(qrCall[1]).toEqual(
      expect.objectContaining({
        alias: 'QR365T7T20260517000000abcdef12',
        monto: 100,
      }),
    );
    expect(qrCall[2].headers.apikeyServicio).toBe('service-key');
    expect(qrCall[2].headers.Authorization).toBe('Bearer token-1');
    expect(qrCall[2].timeout).toBe(30000);
  });

  it('lanza BadRequestException cuando MC4 rechaza generación de QR', async () => {
    httpService.post
      .mockReturnValueOnce(of({ data: { objeto: { token: 'token-1' } } }))
      .mockReturnValueOnce(
        of({
          data: {
            codigo: '1001',
            mensaje: 'Monto inválido',
          },
        }),
      );

    await expect(
      service.generarQr({
        alias: 'QR365T7T20260517000000abcdef12',
        detalleGlosa: 'Alquiler',
        amount: 100,
        fechaVencimiento: '18/05/2026',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('consulta estado devolviendo respuesta MC4 aunque el código no sea exitoso', async () => {
    httpService.post
      .mockReturnValueOnce(of({ data: { objeto: { token: 'token-1' } } }))
      .mockReturnValueOnce(
        of({
          data: {
            codigo: '9999',
            mensaje: 'No encontrado',
          },
        }),
      );

    await expect(service.consultarEstado('alias-1')).resolves.toEqual({
      codigo: '9999',
      mensaje: 'No encontrado',
    });
  });

  it('normaliza errores de transporte MC4', async () => {
    httpService.post.mockReturnValueOnce(
      throwError(() => ({
        response: {
          data: {
            mensaje: 'Servicio caído',
          },
        },
      })),
    );

    await expect(service.consultarEstado('alias-1')).rejects.toBeInstanceOf(
      InternalServerErrorException,
    );
  });
});
