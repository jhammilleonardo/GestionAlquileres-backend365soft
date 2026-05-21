# Maintenance Module

## Responsabilidad

Gestionar solicitudes de mantenimiento, mensajes, adjuntos, etapas, permisos de
entrada, autorizacion owner, proveedores y tecnicos.

## Archivos Clave

- `src/maintenance/maintenance.module.ts`
- `src/maintenance/maintenance.controller.ts`
- `src/maintenance/maintenance.service.ts`
- `src/maintenance/maintenance-*.service.ts`
- `src/maintenance/dto/`
- `src/maintenance/entities/`

## Endpoints

- `/:slug/admin/maintenance`
- `/:slug/admin/maintenance/:id`
- `/:slug/admin/maintenance/:id/messages`
- `/:slug/admin/maintenance/:id/upload`
- `/:slug/admin/maintenance/:id/stage`
- `/:slug/admin/maintenance/:id/authorize`
- `/:slug/admin/maintenance/:id/assign-vendor`
- `/:slug/tenant/maintenance`
- `/:slug/tenant/maintenance/:id/messages`
- `/:slug/tecnico/maintenance`

## Reglas

- Aislamiento tenant obligatorio.
- Adjuntos con compensacion ante fallo DB.
- Historial de etapas obligatorio.
- Owner/tenant/tecnico solo ven recursos permitidos.

