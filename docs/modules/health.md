# Health Module

## Responsabilidad

Exponer estado operativo del backend y conectividad minima con PostgreSQL.

## Archivos Clave

- `src/common/health/health.module.ts`
- `src/common/health/health.controller.ts`

## Endpoints

- `GET /health`

## Reglas

- No exponer secretos ni informacion sensible.
- El endpoint debe ser liviano y apto para orquestadores.
- En produccion debe usarse para health checks y alertas.

