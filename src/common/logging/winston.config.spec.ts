import * as winston from 'winston';
import { buildWinstonOptions } from './winston.config';

describe('buildWinstonOptions', () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('usa nivel "info" por defecto en producción', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.LOG_LEVEL;

    expect(buildWinstonOptions().level).toBe('info');
  });

  it('usa nivel "info" por defecto en staging (entorno desplegado)', () => {
    process.env.NODE_ENV = 'staging';
    delete process.env.LOG_LEVEL;

    expect(buildWinstonOptions().level).toBe('info');
  });

  it('usa nivel "debug" por defecto fuera de producción', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.LOG_LEVEL;

    expect(buildWinstonOptions().level).toBe('debug');
  });

  it('respeta LOG_LEVEL cuando está definido', () => {
    process.env.NODE_ENV = 'production';
    process.env.LOG_LEVEL = 'warn';

    expect(buildWinstonOptions().level).toBe('warn');
  });

  it('incluye un transport de consola', () => {
    const options = buildWinstonOptions();
    const transports = Array.isArray(options.transports)
      ? options.transports
      : [options.transports];

    expect(
      transports.some((t) => t instanceof winston.transports.Console),
    ).toBe(true);
  });
});
