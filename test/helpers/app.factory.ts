import * as path from 'path';
import * as dotenv from 'dotenv';

// Cargar variables de test antes de importar cualquier módulo de NestJS
dotenv.config({ path: path.join(__dirname, '..', '.env.test') });

import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../../src/app.module';
import { DataSource } from 'typeorm';
import { TenantConnectionInterceptor } from '../../src/common/interceptors/tenant-connection.interceptor';
import { schemaNameFromSlug } from '../../src/common/utils/sql-identifier';

export { schemaNameFromSlug };

let app: INestApplication | null = null;

export async function createTestApp(): Promise<INestApplication> {
  if (app) {
    return app;
  }

  app = await NestFactory.create(AppModule, {
    logger: false,
    abortOnError: false,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  const dataSource = app.get(DataSource);
  app.useGlobalInterceptors(new TenantConnectionInterceptor(dataSource));

  await app.init();
  return app;
}

export async function closeTestApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

export async function dropTenantSchema(
  dataSource: DataSource,
  slug: string,
): Promise<void> {
  const schemaName = schemaNameFromSlug(slug);
  await dataSource.query(`DROP SCHEMA IF EXISTS "${schemaName}" CASCADE`);
  await dataSource.query(`DELETE FROM public.tenant WHERE slug = $1`, [slug]);
}

/**
 * Garantiza que el tenant tenga al menos un property_type y property_subtype activos.
 * Retorna { typeId, subtypeId } listos para usar en los tests.
 */
export async function seedPublicPropertyTypes(
  dataSource: DataSource,
  slug: string,
): Promise<{ typeId: number; subtypeId: number }> {
  const schemaName = schemaNameFromSlug(slug);

  const types = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM "${schemaName}".property_types WHERE is_active = true LIMIT 1`,
  );

  let typeId: number;
  if (types.length > 0) {
    typeId = types[0].id;
  } else {
    const inserted = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schemaName}".property_types (name, code, is_active, created_at, updated_at)
       VALUES ('Residencial E2E', 'RES_E2E', true, NOW(), NOW())
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
    );
    typeId =
      inserted.length > 0
        ? inserted[0].id
        : (
            await dataSource.query<{ id: number }[]>(
              `SELECT id FROM "${schemaName}".property_types WHERE code = 'RES_E2E' LIMIT 1`,
            )
          )[0].id;
  }

  const subtypes = await dataSource.query<{ id: number }[]>(
    `SELECT id FROM "${schemaName}".property_subtypes WHERE property_type_id = $1 AND is_active = true LIMIT 1`,
    [typeId],
  );

  let subtypeId: number;
  if (subtypes.length > 0) {
    subtypeId = subtypes[0].id;
  } else {
    const inserted = await dataSource.query<{ id: number }[]>(
      `INSERT INTO "${schemaName}".property_subtypes (name, code, property_type_id, is_active, created_at, updated_at)
       VALUES ('Apartamento E2E', 'APT_E2E', $1, true, NOW(), NOW())
       ON CONFLICT (code) DO NOTHING
       RETURNING id`,
      [typeId],
    );
    subtypeId =
      inserted.length > 0
        ? inserted[0].id
        : (
            await dataSource.query<{ id: number }[]>(
              `SELECT id FROM "${schemaName}".property_subtypes WHERE code = 'APT_E2E' LIMIT 1`,
            )
          )[0].id;
  }

  return { typeId, subtypeId };
}
