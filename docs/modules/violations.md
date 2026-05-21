# Violations Module

## Responsabilidad

Gestionar infracciones, cambios de estado, notificaciones y PDFs.

## Archivos Clave

- `src/violations/violations.module.ts`
- `src/violations/violations.controller.ts`
- `src/violations/violations.service.ts`
- `src/violations/violations-pdf.service.ts`
- `src/violations/dto/`

## Endpoints

- `POST /:slug/admin/violations`
- `GET /:slug/admin/violations`
- `PATCH /:slug/admin/violations/:id/status`
- `POST /:slug/admin/violations/:id/notify`
- `GET /:slug/admin/violations/:id/pdf`

## Reglas

- Validar contrato/tenant antes de crear infraccion.
- PDFs no deben cruzar tenants.
- Notificacion y cambio de estado deben ser auditables.

