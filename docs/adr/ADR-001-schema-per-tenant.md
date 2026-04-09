# ADR-001: Schema-per-tenant vs Row-level isolation

| Campo | Valor |
|-------|-------|
| **Fecha** | 2026-04-07 |
| **Autores** | Equipo 365Soft |
| **Estado** | Aceptado |

---

## Contexto

El sistema es multi-tenant: múltiples inmobiliarias usan la misma instancia de la aplicación. Se necesita aislar completamente los datos de cada empresa para que ningún usuario pueda acceder a datos de otro tenant, ni por error ni por un bug de código.

Se evaluaron dos estrategias:

**Opción A — Row-level isolation:**
Una sola base de datos con un campo `tenant_id` en cada tabla. Todas las queries deben incluir `WHERE tenant_id = ?`. El ORM o un interceptor se encarga de inyectar ese filtro automáticamente.

**Opción B — Schema-per-tenant:**
Cada empresa recibe su propio schema de PostgreSQL (ej: `tenant_mi_inmobiliaria`). El schema `public` almacena solo metadatos globales (tabla `tenant`, suscripciones). El `search_path` de la conexión se cambia por request según el tenant activo.

---

## Decisión

Se eligió **schema-per-tenant (Opción B)**.

El `TenantContextMiddleware` extrae el slug del primer segmento de la URL (`/:slug/...`), busca el tenant en `public.tenant`, y ejecuta `SET search_path TO tenant_<slug>, public` antes de pasar el control al controller. Esto garantiza que todas las queries del request apunten exclusivamente al schema del tenant correcto.

---

## Consecuencias

### Positivas

- **Aislamiento fuerte por diseño:** Si una query olvida un filtro, no hay riesgo de fuga entre tenants. Con row-level isolation ese error expone datos de todos.
- **Backup granular:** Se puede hacer `pg_dump` de un schema individual para exportar o restaurar un tenant sin afectar a los demás.
- **Queries simples:** No se necesita `WHERE tenant_id` en cada consulta. El `search_path` activo hace el trabajo de forma transparente.
- **Performance independiente:** Índices y tablas crecen por tenant, no en una tabla global con millones de filas mezcladas.
- **Eliminación limpia:** `DROP SCHEMA tenant_x CASCADE` elimina todos los datos de un tenant en una sola operación.

### Negativas

- **Migraciones por schema:** Cualquier cambio de esquema debe aplicarse en cada schema de tenant. Se resuelve con `runStartupMigrations()` en `TenantsService` que ejecuta migraciones idempotentes al arrancar.
- **`TenantContextMiddleware` es punto crítico:** Un error en el middleware puede apuntar al schema incorrecto. Tiene tests y validación cruzada con el JWT.
- **El pool de conexiones comparte `search_path`:** Cada request debe resetear el `search_path` a `public` al inicio para evitar contaminación entre requests. Implementado en el middleware.
- **Crecimiento de schemas:** A gran escala (miles de tenants) puede haber impacto en el rendimiento del catálogo interno de PostgreSQL.

---

## Estado

**Aceptado.** En producción desde el inicio del proyecto. No se contempla cambio a row-level isolation en el roadmap actual.
