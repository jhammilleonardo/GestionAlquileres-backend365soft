import type { CallHandler, ExecutionContext } from '@nestjs/common';
import { firstValueFrom, of } from 'rxjs';
import { AuthCookieInterceptor } from './auth-cookie.interceptor';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
} from './auth-cookie.util';

describe('AuthCookieInterceptor', () => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalExposeToken = process.env.AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE;

  afterEach(() => {
    process.env.NODE_ENV = originalNodeEnv;
    process.env.AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE = originalExposeToken;
  });

  it('emite cookies y elimina el access token del body', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE;

    const cookie = jest.fn();
    const interceptor = new AuthCookieInterceptor(
      {
        decode: jest.fn().mockReturnValue({
          sub: 1,
          email: 'admin@test.com',
          role: 'ADMIN',
          tenantSlug: 'demo',
        }),
      } as never,
      { issue: jest.fn().mockResolvedValue('refresh-value') } as never,
    );
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ cookie }) }),
    } as unknown as ExecutionContext;
    const next = {
      handle: () =>
        of({
          access_token: 'jwt-value',
          user: { id: 1, email: 'admin@test.com' },
        }),
    } as CallHandler;

    const response = await firstValueFrom(interceptor.intercept(context, next));

    expect(response).toEqual({ user: { id: 1, email: 'admin@test.com' } });
    expect(cookie).toHaveBeenCalledWith(
      ACCESS_TOKEN_COOKIE,
      'jwt-value',
      expect.objectContaining({ httpOnly: true }),
    );
    expect(cookie).toHaveBeenCalledWith(
      CSRF_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: false }),
    );
    expect(cookie).toHaveBeenCalledWith(
      REFRESH_TOKEN_COOKIE,
      'refresh-value',
      expect.objectContaining({ httpOnly: true, path: '/auth' }),
    );
  });

  it('nunca expone el token en producción aunque la opción legacy esté activa', async () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_EXPOSE_ACCESS_TOKEN_RESPONSE = 'true';

    const interceptor = new AuthCookieInterceptor(
      { decode: jest.fn().mockReturnValue(null) } as never,
      { issue: jest.fn() } as never,
    );
    const context = {
      switchToHttp: () => ({ getResponse: () => ({ cookie: jest.fn() }) }),
    } as unknown as ExecutionContext;

    const response = await firstValueFrom(
      interceptor.intercept(context, {
        handle: () => of({ access_token: 'jwt-value', success: true }),
      }),
    );

    expect(response).toEqual({ success: true });
  });
});
