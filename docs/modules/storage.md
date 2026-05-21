# Storage Module

## Responsabilidad

Guardar y servir archivos privados/publicos mediante un adapter comun para
storage local o S3.

## Archivos Clave

- `src/common/storage/storage.module.ts`
- `src/common/storage/storage.service.ts`
- `src/common/storage/storage.controller.ts`

## Endpoints

- `GET /storage/properties/:slug/:propertyId/:filename`
- `GET /storage/maintenance/:slug/:requestId/:filename`
- `GET /storage/receipts/:slug/:filename`
- `GET /storage/applications/:slug/:applicationId/:filename`
- `GET /storage/inspections/:slug/:inspectionId/:filename`
- `GET /storage/contracts/:slug/:contractId/:filename`

## Reglas

- Produccion debe preferir `STORAGE_DRIVER=s3`.
- Los flujos con archivos deben compensar uploads si falla la DB.
- No montar carpetas completas como assets publicos.

