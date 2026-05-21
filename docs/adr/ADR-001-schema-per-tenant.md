# ADR-001: Schema Por Tenant

| Campo | Valor |
| --- | --- |
| Fecha | 2026-04-07 |
| Estado | Aceptado |

## Contexto

El sistema es multi-tenant: varias inmobiliarias comparten una misma instancia
de backend y base de datos. La prioridad es evitar fugas de datos entre tenants.

Se evaluaron dos enfoques:

- Row-level isolation: una tabla compartida por dominio con columna
  `tenant_id`.
- Schema-per-tenant: un schema PostgreSQL por tenant y `public` para metadata
  global.

## Decision

Se usa schema-per-tenant.

El flujo vigente es:

```text
TenantContextMiddleware -> TenantConnectionInterceptor -> Handler
```

- El middleware resuelve y valida `req.tenant`.
- El interceptor usa `QueryRunner` dedicado y configura `search_path`.
- Rutas sin tenant usan `public`.
- Operaciones cross-tenant/provisioning usan schema calificado y `quoteIdent`.

## Consecuencias

Ventajas:

- Aislamiento fuerte por diseno.
- Backups/restauracion por tenant mas simples.
- Queries de negocio sin `tenant_id` en cada tabla.
- Indices y datos crecen separados por tenant.

Costos:

- El provisioning debe aplicar DDL a cada schema.
- El pool de conexiones exige control estricto de `search_path`.
- Miles de schemas pueden requerir optimizacion operacional.

## Estado Actual

Aceptado y en uso. No hay plan de cambio a row-level isolation.
