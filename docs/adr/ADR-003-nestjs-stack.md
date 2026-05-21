# ADR-003: Stack Backend

| Campo | Valor |
| --- | --- |
| Fecha | 2026-04-07 |
| Estado | Aceptado |

## Contexto

El backend necesita TypeScript, modularidad, validacion robusta, Swagger,
auth/guards, jobs programados, integracion PostgreSQL y soporte para
schema-per-tenant.

## Decision

- Backend: NestJS 11.
- Lenguaje: TypeScript.
- ORM: TypeORM 0.3.
- Base de datos: PostgreSQL.
- Documentacion API: Swagger/OpenAPI.

## Consecuencias

Ventajas:

- NestJS ofrece modulos, DI, guards, middleware, interceptors y testing.
- TypeORM permite SQL raw cuando se requiere DDL/provisioning.
- PostgreSQL soporta schemas, transacciones ACID, JSONB e indices maduros.
- Swagger documenta contratos de API desde DTOs.

Costos:

- TypeORM requiere cuidado con `search_path` y conexiones del pool.
- NestJS agrega boilerplate, pero a cambio fuerza consistencia.
- SQL raw de provisioning debe probarse con PostgreSQL real.

## Estado Actual

Aceptado. El frontend vive en otro repositorio; este ADR documenta el stack del
backend.
