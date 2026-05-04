import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { NestExpressApplication } from '@nestjs/platform-express';
import { join } from 'path';
import helmet from 'helmet';
import { TenantConnectionInterceptor } from './common/interceptors/tenant-connection.interceptor';
import { DataSource } from 'typeorm';

async function bootstrap() {
  // rawBody: true expone req.rawBody (Buffer) necesario para verificar firma de Stripe
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
  });

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
  const reflector = app.get(Reflector);
  app.useGlobalInterceptors(new TenantConnectionInterceptor(dataSource));

  // ── Archivos estáticos — uploads (PDFs de estados de cuenta, etc.) ──────
  app.useStaticAssets(join(process.cwd(), 'uploads'), {
    prefix: '/uploads/',
    setHeaders: (res) => {
      if (res.req.url?.includes('.pdf')) {
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Cache-Control', 'public, max-age=86400');
      }
    },
  });

  // NOTA: /storage/* es servido por StorageController (con autorización).
  // No se monta useStaticAssets aquí para evitar exponer archivos privados
  // (maintenance, receipts, applications) sin control de acceso.

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
