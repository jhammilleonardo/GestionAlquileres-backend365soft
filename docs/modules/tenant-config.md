# Tenant Config Module

## Responsabilidad

Gestionar configuracion operativa del tenant.

## Archivos Clave

- `src/tenant-config/tenant-config.module.ts`
- `src/tenant-config/tenant-config.controller.ts`
- `src/tenant-config/tenant-config.service.ts`
- `src/tenant-config/dto/`

## Endpoints

- `GET /:slug/admin/config`
- `PATCH /:slug/admin/config`
- `PATCH /:slug/admin/config/setup-complete`

## Reglas

- No exponer secretos reales al frontend.
- Validar enums/listas como payment methods y notification channels.
- Cambios sensibles deben ser auditables.

