# Tenants Module

## Responsabilidad

Gestionar metadata de tenants, provisioning de schemas y upgrades de arranque.

## Archivos Clave

- `src/tenants/tenants.module.ts`
- `src/tenants/tenants.controller.ts`
- `src/tenants/tenants.service.ts`
- `src/tenants/tenant-provisioning.service.ts`
- `src/tenants/tenant-startup-upgrade.service.ts`
- `src/tenants/tenant-*-provisioning.service.ts`

## Endpoints

- `GET /tenants`
- `GET /tenants/:id`
- `GET /tenants/slug/:slug`
- `PATCH /tenants/:id`
- `DELETE /tenants/:id`

## Reglas

- Crear tenants nuevos con provisioning completo e idempotente.
- Startup upgrades deben ser seguros al ejecutarse multiples veces.
- No introducir migraciones TypeORM CLI sin decision de arquitectura.

