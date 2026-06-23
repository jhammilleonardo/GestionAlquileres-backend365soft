import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { TenantConnectionInterceptor } from './common/interceptors/tenant-connection.interceptor';
import { DataSource } from 'typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { WinstonModule } from 'nest-winston';
import { buildWinstonOptions } from './common/logging/winston.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true expone req.rawBody (Buffer) necesario para verificar firma de Stripe.
  // bufferLogs retiene los logs de arranque hasta que Winston queda activo como
  // logger de la app, de modo que toda llamada a `Logger` pase por Winston.
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    bodyParser: false,
    bufferLogs: true,
  });
  app.useLogger(WinstonModule.createLogger(buildWinstonOptions()));
  app.disable('x-powered-by');

  app.useBodyParser('json', { limit: '1mb' });
  app.useBodyParser('urlencoded', {
    limit: '256kb',
    extended: false,
    parameterLimit: 100,
  });

  const isProduction = process.env.NODE_ENV === 'production';

  if ((process.env.TRUST_PROXY ?? '').toLowerCase() === 'true') {
    app.set('trust proxy', 1);
  }

  // Parser de cookies — habilita leer el JWT desde la cookie HttpOnly.
  app.use(cookieParser());

  // ── Cabeceras de seguridad HTTP ─────────────────────────────────────────
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          connectSrc: ["'self'"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      hsts: isProduction
        ? {
            maxAge: 31536000,
            includeSubDomains: true,
            preload: true,
          }
        : false,
    }),
  );

  // ── CORS — en producción no se permite fallback a localhost ──────────────
  const configuredOrigins = (
    process.env.FRONTEND_URLS ??
    (isProduction ? '' : 'http://localhost:4200,http://localhost:4201')
  )
    .split(',')
    .map((u) => u.trim())
    .filter(Boolean);

  const allowedOrigins = configuredOrigins.map((origin) => {
    let url: URL;
    try {
      url = new URL(origin);
    } catch {
      throw new Error(`FRONTEND_URLS contiene una URL inválida: ${origin}`);
    }
    if (
      !['http:', 'https:'].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) {
      throw new Error(`Origen CORS inválido: ${origin}`);
    }
    if (isProduction && url.protocol !== 'https:') {
      throw new Error(`Origen CORS debe usar HTTPS en producción: ${origin}`);
    }
    return url.origin;
  });

  if (
    isProduction &&
    (allowedOrigins.length === 0 ||
      allowedOrigins.some(
        (origin) => origin.includes('*') || origin.includes('localhost'),
      ))
  ) {
    throw new Error('FRONTEND_URLS debe listar dominios reales en producción');
  }

  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(new Error(`CORS origin not allowed: ${origin}`), false);
    },
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders:
      'Content-Type, Accept, Authorization, X-Tenant-ID, X-CSRF-Token, Idempotency-Key',
    exposedHeaders: 'Content-Disposition',
    maxAge: 600,
  });

  // Validación global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  );

  // ── Interceptor global de conexión por tenant (fix race condition) ────────
  const dataSource = app.get(DataSource);
  app.useGlobalInterceptors(new TenantConnectionInterceptor(dataSource));

  const swaggerEnabled =
    process.env.NODE_ENV !== 'production' ||
    (process.env.SWAGGER_ENABLED ?? '').toLowerCase() === 'true';
  if (swaggerEnabled) {
    try {
      const swaggerConfig = new DocumentBuilder()
        .setTitle('365Soft API')
        .setDescription('API multi-tenant para gestión de alquileres')
        .setVersion('1.0')
        .addBearerAuth()
        .build();
      const swaggerDocument = SwaggerModule.createDocument(app, swaggerConfig);
      SwaggerModule.setup('docs', app, swaggerDocument, {
        swaggerOptions: { persistAuthorization: !isProduction },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      const stack = error instanceof Error ? error.stack : undefined;
      logger.error(`Swagger no pudo generarse: ${message}`, stack);
      if ((process.env.SWAGGER_FAIL_FAST ?? '').toLowerCase() === 'true') {
        throw error;
      }
    }
  }

  // NOTA: /storage/* es servido por StorageController (con autorización o
  // presigned URL en S3). No se monta useStaticAssets para evitar exponer
  // archivos privados sin control de acceso.

  const server = await app.listen(process.env.PORT ?? 3000);
  server.requestTimeout = 120_000;
  server.headersTimeout = 15_000;
  server.keepAliveTimeout = 5_000;
  server.maxHeadersCount = 100;
}
void bootstrap();
