# Applications Module

## Responsabilidad

Gestionar solicitudes de alquiler, documentos, screening, aprobacion y cambios
de estado.

## Archivos Clave

- `src/applications/applications.module.ts`
- `src/applications/applications.controller.ts`
- `src/applications/applications.service.ts`
- `src/applications/application-*.service.ts`
- `src/applications/dto/`
- `src/applications/entities/`

## Endpoints

- `POST /:slug/applications`
- `GET /:slug/applications/my-applications`
- `GET /:slug/applications`
- `GET /:slug/applications/:id`
- `PATCH /:slug/applications/:id/approve`
- `PATCH /:slug/applications/:id/status`
- `POST /:slug/applications/:id/documents`
- `PATCH /:slug/applications/:id/screening`
- `PATCH /:slug/applications/:id/screening-fee`

## Reglas

- Aprobacion debe ser transaccional con creacion de contrato.
- Documentos deben pasar por storage y compensacion.
- Screening puede aprobar, rechazar o pedir co-firmante.
- Notificaciones post-commit.

