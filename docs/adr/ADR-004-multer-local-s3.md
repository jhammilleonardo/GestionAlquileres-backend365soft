# ADR-004: Storage Local Y S3

| Campo | Valor |
| --- | --- |
| Fecha | 2026-04-07 |
| Estado | Aceptado |

## Contexto

El backend maneja imagenes de propiedades, adjuntos de mantenimiento,
documentos de solicitudes, PDFs de contratos/liquidaciones, recibos e
inspecciones. Desarrollo necesita storage sin credenciales externas, pero
produccion necesita storage durable y escalable.

## Decision

Usar `StorageService` como adapter unico:

- `STORAGE_DRIVER=local` para desarrollo.
- `STORAGE_DRIVER=s3` para produccion.

Los controllers no deben servir directorios completos con `useStaticAssets`.
Los archivos pasan por `StorageController` o URLs firmadas.

## Consecuencias

Ventajas:

- Desarrollo local simple.
- Produccion lista para S3.
- Servicios de dominio no dependen del driver.
- Se puede compensar archivos si falla una transaccion DB.

Costos:

- Produccion requiere bucket, IAM y politica de URLs firmadas.
- Storage local no es valido para escalado horizontal.
- Todo flujo con archivos debe testear compensacion y permisos.

## Estado Actual

Aceptado. `StorageService` soporta local y S3 via variables de entorno.
