# Contract Templates Module

## Responsabilidad

Gestionar plantillas de contrato por tenant.

## Archivos Clave

- `src/contract-templates/contract-templates.module.ts`
- `src/contract-templates/contract-templates.controller.ts`
- `src/contract-templates/contract-templates.service.ts`
- `src/contract-templates/entities/`
- `src/contract-templates/dto/`

## Endpoints

- `POST /:slug/admin/contract-templates`
- `GET /:slug/admin/contract-templates`
- `GET /:slug/admin/contract-templates/:id`
- `PATCH /:slug/admin/contract-templates/:id`
- `DELETE /:slug/admin/contract-templates/:id`

## Reglas

- Plantillas pertenecen al tenant activo.
- Validar contenido antes de usarlo en PDFs.
- No mezclar plantilla con datos reales del contrato.

