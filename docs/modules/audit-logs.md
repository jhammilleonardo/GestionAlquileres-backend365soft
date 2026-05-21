# Audit Logs Module

## Responsabilidad

Registrar y consultar trazabilidad de acciones administrativas.

## Archivos Clave

- `src/audit-logs/audit-logs.module.ts`
- `src/audit-logs/audit-logs.controller.ts`
- `src/audit-logs/audit-logs.service.ts`

## Endpoints

- `GET /:slug/admin/audit-logs`

## Reglas

- Acciones sensibles deben registrar actor, entidad, accion y metadata minima.
- Logs pertenecen al schema tenant.
- No guardar secretos en metadata.

