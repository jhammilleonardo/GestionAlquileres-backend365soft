-- Script de inicialización ejecutado automáticamente por postgres en el primer arranque.
-- Crea la tabla de tenants en el schema public (equivalente a synchronize: true solo para esta entidad).

CREATE TABLE IF NOT EXISTS public.tenant (
  id          SERIAL PRIMARY KEY,
  slug        VARCHAR NOT NULL UNIQUE,
  schema_name VARCHAR NOT NULL UNIQUE,
  company_name VARCHAR NOT NULL,
  logo_url    VARCHAR,
  currency    VARCHAR NOT NULL DEFAULT 'BOB',
  locale      VARCHAR NOT NULL DEFAULT 'es-BO',
  is_active   BOOLEAN NOT NULL DEFAULT true,
  created_at  TIMESTAMP NOT NULL DEFAULT now(),
  updated_at  TIMESTAMP NOT NULL DEFAULT now()
);
