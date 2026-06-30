import { ForbiddenException } from '@nestjs/common';
import type { NextFunction, Request, Response } from 'express';
import { CsrfMiddleware } from './csrf.middleware';
import {
  ACCESS_TOKEN_COOKIE,
  CSRF_COOKIE,
  REFRESH_TOKEN_COOKIE,
  refreshTokenCookieName,
} from './auth-cookie.util';

describe('CsrfMiddleware', () => {
  let middleware: CsrfMiddleware;
  let next: jest.MockedFunction<NextFunction>;
  const res = {} as Response;

  const run = (req: Partial<Request>) =>
    middleware.use(req as Request, res, next);

  beforeEach(() => {
    middleware = new CsrfMiddleware();
    next = jest.fn();
  });

  it('permite métodos seguros (GET) sin chequear', () => {
    run({ method: 'GET', headers: {}, cookies: {} });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('permite mutaciones con Authorization Bearer (no es CSRF)', () => {
    run({
      method: 'POST',
      headers: { authorization: 'Bearer x' },
      cookies: { [ACCESS_TOKEN_COOKIE]: 'jwt' },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('permite mutaciones sin sesión por cookie', () => {
    run({ method: 'POST', headers: {}, cookies: {} });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('rechaza mutación cookie-auth sin token CSRF', () => {
    expect(() =>
      run({
        method: 'POST',
        headers: {},
        cookies: { [ACCESS_TOKEN_COOKIE]: 'jwt' },
      }),
    ).toThrow(ForbiddenException);
    expect(next).not.toHaveBeenCalled();
  });

  it('rechaza si el header CSRF no coincide con la cookie', () => {
    expect(() =>
      run({
        method: 'POST',
        headers: { 'x-csrf-token': 'aaa' },
        cookies: { [ACCESS_TOKEN_COOKIE]: 'jwt', [CSRF_COOKIE]: 'bbb' },
      }),
    ).toThrow(ForbiddenException);
  });

  it('permite si el header CSRF coincide con la cookie (double-submit)', () => {
    run({
      method: 'POST',
      headers: { 'x-csrf-token': 'match' },
      cookies: { [ACCESS_TOKEN_COOKIE]: 'jwt', [CSRF_COOKIE]: 'match' },
    });
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('protege refresh aunque el access token ya haya expirado', () => {
    run({
      method: 'POST',
      headers: { 'x-csrf-token': 'match' },
      cookies: { [REFRESH_TOKEN_COOKIE]: 'refresh', [CSRF_COOKIE]: 'match' },
    });

    expect(next).toHaveBeenCalledTimes(1);
  });

  it('protege refresh con cookies de contexto', () => {
    run({
      method: 'POST',
      headers: { 'x-csrf-token': 'match' },
      cookies: { [refreshTokenCookieName('admin')]: 'refresh', [CSRF_COOKIE]: 'match' },
    });

    expect(next).toHaveBeenCalledTimes(1);
  });
});
