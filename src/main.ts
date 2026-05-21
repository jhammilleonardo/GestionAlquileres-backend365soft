import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { TenantConnectionInterceptor } from './common/interceptors/tenant-connection.interceptor';
import { DataSource } from 'typeorm';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  // rawBody: true expone req.rawBody (Buffer) necesario para verificar firma de Stripe
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

  if ((process.env.TRUST_PROXY ?? '').toLowerCase() === 'true') {
    app.set('trust proxy', 1);
  }

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
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // ── CORS — origins desde variable de entorno en producción ──────────────
  const allowedOrigins = (
    process.env.FRONTEND_URLS ?? 'http://localhost:4200,http://localhost:4201'
  )
    .split(',')
    .map((u) => u.trim());

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: 'GET,HEAD,PUT,PATCH,POST,DELETE,OPTIONS',
    allowedHeaders: 'Content-Type, Accept, Authorization, X-Tenant-ID',
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
        swaggerOptions: { persistAuthorization: true },
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

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
