# Owner Portal Module

## Responsabilidad

Portal de propietarios para dashboard, propiedades, liquidaciones, contratos y
mantenimiento.

## Archivos Clave

- `src/owner-portal/owner-portal.module.ts`
- `src/owner-portal/owner-portal.controller.ts`
- `src/owner-portal/owner-portal.service.ts`
- `src/owner-portal/dto/`

## Endpoints

- `GET /:slug/owner/dashboard`
- `GET /:slug/owner/properties`
- `GET /:slug/owner/statements`
- `GET /:slug/owner/statements/:id/pdf`
- `GET /:slug/owner/maintenance`
- `PATCH /:slug/owner/maintenance/:id/authorize`
- `GET /:slug/owner/contracts`

## Reglas

- Validar ownership en cada endpoint.
- Un owner no puede ver PDFs o mantenimiento de otro owner.
- Autorizacion de mantenimiento solo aplica a propiedades propias.

