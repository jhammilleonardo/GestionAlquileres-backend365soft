# Arquitectura

## Stack

- NestJS 11.
- TypeScript.
- PostgreSQL.
- TypeORM.
- JWT.
- Swagger/OpenAPI.

## Multi-Tenancy

El backend usa aislamiento por schema PostgreSQL:

```text
Request -> TenantContextMiddleware -> TenantConnectionInterceptor -> Handler
```

Reglas:

- `TenantContextMiddleware` resuelve `req.tenant` y valida que el JWT
  corresponda al tenant solicitado.
- `TenantContextMiddleware` no ejecuta `SET search_path`.
- `TenantConnectionInterceptor` usa un `QueryRunner` dedicado por request y es
  el responsable de fijar `search_path`.
- Rutas sin tenant usan `search_path=public`.
- Servicios cross-tenant o de provisioning usan tablas calificadas por schema y
  `quoteIdent` para identificadores dinamicos.
- Transacciones internas que abren su propio `QueryRunner` deben fijar su propio
  contexto de schema sin tocar conexiones compartidas.

## Capas

- Controllers: autenticacion, permisos, validacion de entrada y respuestas
  tipadas Swagger.
- Services fachada: API interna estable por modulo.
- Services de dominio: validaciones, queries, persistencia y side effects
  separados cuando el modulo crece.
- DTOs: entrada y salida documentadas.
- Entities: persistencia, no deben usarse como contrato publico de API.
- Adapters: integraciones externas como storage, monitoring y notificaciones.

## Transacciones Y Side Effects

Reglas:

- Cambios de estado criticos usan transacciones.
- Cuando hay concurrencia, bloquear con `FOR UPDATE`.
- Audit logs, notificaciones y archivos deben ejecutarse post-commit o tener
  compensacion si participan antes del commit.
- No mezclar aprobacion, rechazo, notificacion, storage y persistencia en un
  unico metodo grande si hay reglas de negocio independientes.

## Swagger

Los controllers deben documentar:

- `@ApiBody` para payloads.
- `@ApiOkResponse` o `@ApiCreatedResponse` con DTOs de salida.
- `@ApiParam` y `@ApiQuery` para rutas y filtros.
- Schemas explicitos cuando la respuesta sea union o contenga `null`.

Evitar exponer entities TypeORM directamente en Swagger, porque pueden contener
relaciones bidireccionales y provocar ciclos.

